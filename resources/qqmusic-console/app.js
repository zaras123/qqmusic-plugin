const bridge = window.QQMusicBridge || {};
const $ = (id) => document.getElementById(id);
const JOB_KEY = bridge.storageKey || "qqmusic.console.job";
const THEME_KEY = bridge.themeKey || "qqmusic.console.theme";

// AstrBot 插件视图 iframe 是 sandbox（无 allow-same-origin），直接访问 localStorage 会抛异常。
const memoryStore = new Map();
function storeGet(key) {
  try { return localStorage.getItem(key); } catch { return memoryStore.get(key) ?? null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { memoryStore.set(key, value); }
}
function storeRemove(key) {
  try { localStorage.removeItem(key); } catch { memoryStore.delete(key); }
}

const state = {
  items: [],
  groups: [],
  groupMap: new Map(),
  activePlatform: "",
  selected: new Set(),
  selectedGroups: new Set(),
  job: null,
  pollTimer: 0,
  sending: false,
};

function setStatus(text, bad = false) {
  const pill = $("status-pill");
  pill.textContent = text;
  pill.classList.toggle("bad", Boolean(bad));
}

function applyTheme(theme) {
  const dark = theme === "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  $("theme-toggle").textContent = dark ? "LIGHT" : "DARK";
}

function parentTheme() {
  try {
    return window.parent.document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function showError(message) {
  const box = $("job");
  box.classList.remove("hidden");
  box.replaceChildren();
  const p = document.createElement("p");
  p.className = "job-line error";
  p.textContent = message;
  box.append(p);
}

function showConfigWarning(message) {
  const box = $("config-warning");
  if (!box) return;
  const text = box.querySelector("span");
  if (text) {
    text.textContent =
      message || "还没有配置 API Token，配置后才能搜索 API 本地曲库。";
  }
  box.classList.remove("hidden");
}

function hideConfigWarning() {
  $("config-warning")?.classList.add("hidden");
}

async function api(path, options = {}) {
  if (typeof bridge.request !== "function") {
    throw new Error("当前框架的 WebUI bridge 未加载");
  }
  return bridge.request(path, options);
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (!total) return "";
  return `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")}`;
}

function updateSelectionSummary() {
  const songs = state.selected.size;
  const groups = selectedTargets().length;
  $("selection-summary").textContent = songs
    ? `已选 ${songs} 首 · ${groups} 个群`
    : "未选择歌曲";
  $("send").innerHTML = songs ? `发送 ${songs}×${groups} <i>→</i>` : "发送 <i>→</i>";
  $("send").disabled = state.sending || !songs || !groups;
}

function uinFromPlatform(platform) {
  return String(platform || "").includes(":") ? String(platform).split(":").pop() : "";
}

function targetKey(platform, uin, groupId) {
  return `${platform}\u0000${uin || ""}\u0000${groupId}`;
}

function parseManualTargets() {
  const rows = [];
  const seen = new Set();
  const fallback = $("manual-platform").value || state.groups[0]?.platform || "";
  for (const raw of ($("manual-groups").value || "").split(/[\s,，;；]+/)) {
    const text = raw.trim();
    if (!text) continue;
    let platform = fallback;
    let uin = "";
    let id = text;
    if (text.includes("|")) {
      const parts = text.split("|");
      platform = parts[0].trim();
      if (parts.length >= 3) {
        uin = parts[1].trim();
        id = parts.slice(2).join("|").trim();
      } else {
        id = parts.slice(1).join("|").trim();
      }
    }
    if (!uin) uin = uinFromPlatform(platform);
    const key = targetKey(platform, uin, id);
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(id) || seen.has(key)) continue;
    seen.add(key);
    rows.push({ platform, uin, group_id: id, name: id });
  }
  return rows;
}

function selectedTargets() {
  const rows = [];
  const seen = new Set();
  for (const key of state.selectedGroups) {
    const target = state.groupMap.get(key);
    if (target && !seen.has(key)) {
      seen.add(key);
      rows.push(target);
    }
  }
  for (const target of parseManualTargets()) {
    const key = targetKey(target.platform, target.uin, target.group_id);
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(target);
    }
  }
  return rows;
}

function renderManualPlatforms() {
  const select = $("manual-platform");
  const current = select.value;
  select.replaceChildren();
  const platforms = state.groups.filter((row) => row.platform);
  if (!platforms.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "无可用适配器";
    select.append(option);
    return;
  }
  for (const platform of platforms) {
    const option = document.createElement("option");
    option.value = platform.platform;
    option.textContent = platform.name || platform.platform;
    select.append(option);
  }
  if (platforms.some((platform) => platform.platform === current)) select.value = current;
}

function renderResults() {
  const host = $("results");
  host.replaceChildren();
  const items = state.items;
  $("stat-tracks").textContent = String(items.length).padStart(2, "0");
  $("result-summary").textContent = items.length
    ? `共 ${items.length} 首 / TRACKS READY`
    : "没有结果";
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "没有匹配的本地曲库歌曲。";
    host.append(p);
    updateSelectionSummary();
    return;
  }
  for (const [index, item] of items.entries()) {
    const row = document.createElement("label");
    row.className = `song-row${item.available ? "" : " unavailable"}`;

    const order = document.createElement("span");
    order.className = "song-index";
    order.textContent = String(index + 1).padStart(2, "0");

    const cover = document.createElement("span");
    cover.className = "song-cover";
    cover.textContent = "♪";
    if (item.cover) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.src = item.cover;
      img.addEventListener("error", () => img.remove(), { once: true });
      cover.append(img);
    }

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = state.selected.has(item.id);
    check.disabled = !item.available;
    check.addEventListener("change", () => {
      if (check.checked) state.selected.add(item.id);
      else state.selected.delete(item.id);
      updateSelectionSummary();
    });

    const main = document.createElement("div");
    main.className = "song-main";
    const title = document.createElement("p");
    title.className = "song-title";
    title.textContent = item.title || "未知歌曲";
    const meta = document.createElement("p");
    meta.className = "song-meta";
    meta.textContent = [item.artist, item.album].filter(Boolean).join(" · ");
    main.append(title, meta);

    const tag = document.createElement("span");
    tag.className = "song-tag";
    tag.textContent = item.available
      ? [item.quality, item.source].filter(Boolean).join(" · ") || "本地"
      : "文件缺失";

    const duration = document.createElement("span");
    duration.className = "song-duration";
    duration.textContent = formatDuration(item.duration);

    row.append(order, cover, main, tag, duration, check);
    host.append(row);
  }
  updateSelectionSummary();
}

let groupRenderTimer = 0;
function scheduleGroupRender() {
  clearTimeout(groupRenderTimer);
  groupRenderTimer = window.setTimeout(renderGroups, 40);
}

function renderAdapterTabs(platforms) {
  const host = $("adapter-tabs");
  host.replaceChildren();
  if (!platforms.length) {
    host.classList.add("hidden");
    return;
  }
  host.classList.remove("hidden");
  for (const platform of platforms) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `adapter-tab${platform.platform === state.activePlatform ? " active" : ""}`;
    button.textContent = platform.name || platform.platform;
    const count = document.createElement("em");
    count.textContent = platform.groups.length;
    button.append(count);
    button.addEventListener("click", () => {
      state.activePlatform = platform.platform;
      renderGroups();
    });
    host.append(button);
  }
}

function renderGroups() {
  const host = $("groups");
  host.replaceChildren();
  renderManualPlatforms();
  const filter = ($("group-filter").value || "").trim().toLowerCase();
  const platforms = state.groups.filter((row) => row.groups?.length);
  if (!platforms.some((row) => row.platform === state.activePlatform)) {
    state.activePlatform = platforms[0]?.platform || "";
  }
  renderAdapterTabs(platforms);
  const visiblePlatforms = platforms.filter((row) => row.platform === state.activePlatform);
  const groupTotal = platforms.reduce((total, row) => total + (row.groups?.length || 0), 0);
  const visibleTotal = visiblePlatforms.reduce((total, row) => total + (row.groups?.length || 0), 0);
  const keyOf = (platformId, uin, groupId) => targetKey(platformId, uin, groupId);
  const allRows = platforms.flatMap((platform) =>
    (platform.groups || []).map((group) => ({
      platform: platform.platform,
      uin: platform.uin || group.bot || "",
      group,
    }))
  );
  const names = new Map(
    allRows.map(({ platform, uin, group }) => [
      keyOf(platform, uin, group.group_id),
      group.name || group.group_id,
    ])
  );
  state.groupMap.clear();
  for (const { platform, uin, group } of allRows) {
    state.groupMap.set(keyOf(platform, uin, group.group_id), {
      platform,
      uin,
      group_id: group.group_id,
      name: group.name || group.group_id,
    });
  }
  for (const key of state.selectedGroups) {
    if (!state.groupMap.has(key)) state.selectedGroups.delete(key);
  }
  $("stat-groups").textContent = String(groupTotal).padStart(2, "0");
  $("group-count").textContent = `${visibleTotal} GROUPS · ${state.selectedGroups.size} SELECTED`;
  const activeRows = visiblePlatforms.flatMap((platform) =>
    (platform.groups || []).map((group) => ({
      platform: platform.platform,
      uin: platform.uin || group.bot || "",
      group,
    }))
  );
  const allSelected =
    activeRows.length > 0 &&
    activeRows.every(({ platform, uin, group }) =>
      state.selectedGroups.has(keyOf(platform, uin, group.group_id))
    );
  $("select-all-groups").textContent = allSelected ? "取消当前" : "全选当前";

  const chips = $("selected-groups");
  chips.replaceChildren();
  if (!state.selectedGroups.size) {
    chips.classList.add("hidden");
  } else {
    chips.classList.remove("hidden");
    const label = document.createElement("span");
    label.className = "selected-label";
    label.textContent = "已选";
    chips.append(label);
    for (const key of state.selectedGroups) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "group-chip";
      chip.textContent = `${names.get(key) || key.split("\u0000")[2]} ×`;
      chip.addEventListener("click", () => {
        state.selectedGroups.delete(key);
        updateSelectionSummary();
        renderGroups();
      });
      chips.append(chip);
    }
  }

  if (!platforms.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "当前没有可读取的群列表，可在下方手动填写群号。";
    host.append(p);
    return;
  }
  for (const platform of visiblePlatforms) {
    const rows = platform.groups.filter((group) => {
      if (!filter) return true;
      return (
        String(group.name || "").toLowerCase().includes(filter) ||
        String(group.group_id || "").includes(filter)
      );
    });
    if (!rows.length) continue;
    const head = document.createElement("div");
    head.className = "platform-head";
    const title = document.createElement("strong");
    title.textContent = platform.name || platform.platform;
    const count = document.createElement("em");
    count.textContent = `${rows.length}`;
    const selectPlatform = document.createElement("button");
    selectPlatform.type = "button";
    const platformIds = rows.map((group) =>
      keyOf(platform.platform, platform.uin || group.bot || "", group.group_id)
    );
    const platformAll = platformIds.every((key) => state.selectedGroups.has(key));
    selectPlatform.textContent = platformAll ? "取消" : "全选";
    selectPlatform.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const key of platformIds) {
        if (platformAll) state.selectedGroups.delete(key);
        else state.selectedGroups.add(key);
      }
      updateSelectionSummary();
      renderGroups();
    });
    head.append(title, count, selectPlatform);
    host.append(head);
    for (const group of rows) {
      const row = document.createElement("label");
      row.className = "group-row";
      const check = document.createElement("input");
      check.type = "checkbox";
      const uin = platform.uin || group.bot || "";
      const key = keyOf(platform.platform, uin, group.group_id);
      check.checked = state.selectedGroups.has(key);
      check.addEventListener("change", () => {
        if (check.checked) state.selectedGroups.add(key);
        else state.selectedGroups.delete(key);
        updateSelectionSummary();
        scheduleGroupRender();
      });
      const main = document.createElement("span");
      main.className = "group-main";
      const name = document.createElement("strong");
      name.textContent = group.name || group.group_id;
      const meta = document.createElement("small");
      meta.textContent = `${group.group_id}${uin ? ` · BOT ${uin}` : ""}`;
      main.append(name, meta);
      row.append(check, main);
      host.append(row);
    }
  }
  updateSelectionSummary();
}

function renderJob(job) {
  state.job = job;
  const percent = job.total ? Math.min(100, (job.done / job.total) * 100) : 0;
  const labels = {
    running: "发送中",
    done: "已完成",
    error: "任务失败",
  };
  const statusText = labels[job.status] || job.status || "未知";
  $("footer-state").textContent = `${statusText} / ${job.done || 0}-${job.total || 0}`;
  $("job-status").textContent = `${statusText} · ${job.done || 0}/${job.total || 0}`;
  $("job-status").classList.toggle("bad", job.status === "error");

  for (const hostId of ["job", "job-large"]) {
    const host = $(hostId);
    if (!host) continue;
    host.classList.remove("hidden");
    host.replaceChildren();
    const bar = document.createElement("div");
    bar.className = "progress";
    const fill = document.createElement("span");
    fill.style.width = `${percent}%`;
    bar.append(fill);
    host.append(bar);
    const line = document.createElement("p");
    line.className = "job-line";
    line.textContent = `${statusText} · ${job.done || 0}/${job.total || 0}`;
    host.append(line);
    if (job.error) {
      const error = document.createElement("p");
      error.className = "job-line error";
      error.textContent = job.error;
      host.append(error);
    }
    const list = document.createElement("div");
    list.className = "result-list";
    for (const row of job.results || []) {
      const wrap = document.createElement("div");
      wrap.className = "result-row";
      const dot = document.createElement("span");
      dot.className = `dot${row.ok ? " ok" : ""}`;
      const text = document.createElement("span");
      const target = [row.groupName || row.groupId || "群", row.platform]
        .filter(Boolean)
        .join(" · ");
      text.textContent = `${row.title || row.itemId || "歌曲"} → ${target}${
        row.ok ? "：已发送" : `：${row.reason || "失败"}`
      }`;
      wrap.append(dot, text);
      list.append(wrap);
    }
    host.append(list);
  }
}

function stopPolling() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = 0;
  }
}

async function pollJobId(jobId) {
  if (!jobId) return;
  try {
    const data = await api(`job?id=${encodeURIComponent(jobId)}`);
    renderJob(data.job);
    if (["done", "error"].includes(data.job.status)) {
      state.sending = false;
      $("send").disabled = false;
      updateSelectionSummary();
      setStatus("已连接 · 发送完成");
      $("footer-state").textContent = data.job.status === "done" ? "DONE" : "ERROR";
      return;
    }
  } catch (error) {
    if (error.status === 404) {
      storeRemove(JOB_KEY);
      state.sending = false;
      updateSelectionSummary();
      return;
    }
    showError(`读取发送进度失败：${error.message || error}`);
    state.sending = false;
    updateSelectionSummary();
    return;
  }
  state.pollTimer = window.setTimeout(() => pollJobId(jobId), 900);
}

async function loadGroups() {
  const button = $("refresh-groups");
  button.disabled = true;
  try {
    const data = await api("groups");
    state.groups = Array.isArray(data.platforms) ? data.platforms : [];
    renderGroups();
  } catch (error) {
    const host = $("groups");
    host.replaceChildren();
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = `读取群列表失败：${error.message || error}`;
    host.append(p);
  } finally {
    button.disabled = false;
  }
}

async function search() {
  const button = $("search");
  button.disabled = true;
  setStatus("正在检索曲库…");
  try {
    const data = await api(
      `search?q=${encodeURIComponent($("query").value.trim())}&limit=${Number($("limit").value) || 50}`,
      { method: "GET" }
    );
    state.items = Array.isArray(data.items) ? data.items : [];
    state.selected.clear();
    renderResults();
    hideConfigWarning();
    setStatus(`已连接 · ${state.items.length} 首 · ${state.selectedGroups.size} 群`);
    $("footer-state").textContent = `READY / ${state.items.length} TRACKS`;
  } catch (error) {
    state.items = [];
    state.selected.clear();
    renderResults();
    if (error.code === "TOKEN_REQUIRED") {
      showConfigWarning(error.message);
      $("job").classList.add("hidden");
      setStatus("未配置 API Token", true);
    } else {
      hideConfigWarning();
      showError(`搜索失败：${error.message || error}`);
      setStatus("连接失败", true);
    }
  } finally {
    button.disabled = false;
  }
}

async function sendSelected() {
  if (state.sending) return;
  const ids = [...state.selected];
  const targets = selectedTargets();
  if (!ids.length) return showError("请至少选择一首歌曲。");
  if (!targets.length) return showError("请至少选择一个群。");
  state.sending = true;
  $("send").disabled = true;
  setStatus("正在创建发送任务…");
  try {
    const data = await api("send", {
      method: "POST",
      body: JSON.stringify({ ids, targets }),
    });
    storeSet(JOB_KEY, data.jobId);
    $("job").replaceChildren();
    const line = document.createElement("p");
    line.className = "job-line";
    line.textContent = `已开始发送：${data.songs} 首 × ${data.groups} 个群`;
    $("job").append(line);
    $("job").classList.remove("hidden");
    $("job-large").replaceChildren(line.cloneNode(true));
    setStatus("发送中…");
    $("footer-state").textContent = "SENDING";
    stopPolling();
    await pollJobId(data.jobId);
  } catch (error) {
    state.sending = false;
    $("send").disabled = false;
    if (error.code === "TOKEN_REQUIRED") {
      showConfigWarning(error.message);
      setStatus("未配置 API Token", true);
    } else {
      showError(`发送失败：${error.message || error}`);
      setStatus("发送失败", true);
    }
    updateSelectionSummary();
  }
}

function setTab(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll(".panel-view")) {
    panel.classList.toggle("hidden", panel.id !== `panel-${name}`);
  }
}

function bind() {
  $("select-all-groups").addEventListener("click", () => {
    const active = state.groups.find(
      (row) => row.platform === state.activePlatform && row.groups?.length
    );
    const keys = (active?.groups || []).map(
      (group) => `${state.activePlatform}\u0000${active?.uin || group.bot || ""}\u0000${group.group_id}`
    );
    const allSelected = keys.length > 0 && keys.every((key) => state.selectedGroups.has(key));
    if (allSelected) state.selectedGroups.clear();
    else for (const key of keys) state.selectedGroups.add(key);
    renderGroups();
    updateSelectionSummary();
  });
  $("clear-groups").addEventListener("click", () => {
    state.selectedGroups.clear();
    updateSelectionSummary();
    renderGroups();
  });
  $("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    storeSet(THEME_KEY, next);
    applyTheme(next);
  });
  $("search").addEventListener("click", search);
  $("query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") search();
  });
  $("refresh").addEventListener("click", () => location.reload());
  $("refresh-groups").addEventListener("click", loadGroups);
  const openSettings = $("open-settings");
  if (typeof bridge.openSettings === "function") {
    openSettings.classList.remove("hidden");
    openSettings.addEventListener("click", () => bridge.openSettings());
  }
  $("config-warning-open").addEventListener("click", () => {
    if (typeof bridge.openSettings === "function") bridge.openSettings();
    else showError("请在当前框架的插件配置里填写 API 地址和 Token。");
  });
  $("group-filter").addEventListener("input", renderGroups);
  $("manual-groups").addEventListener("input", updateSelectionSummary);
  $("manual-platform").addEventListener("change", updateSelectionSummary);
  $("select-all").addEventListener("click", () => {
    for (const item of state.items) if (item.available) state.selected.add(item.id);
    renderResults();
  });
  $("clear-selection").addEventListener("click", () => {
    state.selected.clear();
    renderResults();
  });
  $("send").addEventListener("click", sendSelected);
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  }
}

async function main() {
  applyTheme(storeGet(THEME_KEY) || parentTheme());
  bind();
  if (bridge.platformLabel) {
    const crumb = document.querySelector(".crumb");
    if (crumb) crumb.textContent = bridge.platformLabel;
  }
  if (typeof bridge.ready === "function") {
    try {
      await bridge.ready();
    } catch {
      /* bridge 自己会给出连接错误 */
    }
  }
  if (typeof bridge.request !== "function") {
    setStatus("连接失败", true);
    showError("当前框架的 WebUI bridge 未加载，请刷新页面或重启插件。");
    return;
  }
  setStatus("正在连接…");
  await Promise.all([loadGroups(), search()]);
  const lastJob = storeGet(JOB_KEY);
  if (lastJob) {
    state.sending = true;
    await pollJobId(lastJob);
  }
}

main().catch((error) => {
  setStatus("连接失败", true);
  showError(error.message || String(error));
});
