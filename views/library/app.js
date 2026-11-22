const bridge = window.AstrBotPluginView || window.AstrBotPluginPage;

const el = (id) => document.getElementById(id);
const state = {
  platforms: [],
  items: [],
  selectedItems: new Set(),
  selectedTargets: new Map(),
  jobId: "",
  pollTimer: 0,
  sending: false,
};

function safeText(value) {
  return String(value ?? "");
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minute = Math.floor(total / 60);
  const second = Math.floor(total % 60);
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function setBusy(button, busy) {
  if (button) button.disabled = Boolean(busy);
}

function showError(message) {
  const box = el("job");
  box.classList.remove("hidden");
  box.replaceChildren();
  const p = document.createElement("p");
  p.className = "job-line error";
  p.textContent = message;
  box.append(p);
}

function targetKey(platform, groupId) {
  return `${platform}\u0000${groupId}`;
}

function parseManualTargets() {
  const platform = el("manual-platform").value;
  const rows = [];
  const text = el("manual-groups").value || "";
  for (const raw of text.split(/[\s,，;；]+/)) {
    const value = raw.trim();
    if (!value) continue;
    const parts = value.split("|");
    const rowPlatform = parts.length === 2 ? parts[0].trim() : platform;
    const groupId = parts.length === 2 ? parts[1].trim() : value;
    if (rowPlatform && /^[A-Za-z0-9_.:-]{1,128}$/.test(groupId)) {
      rows.push({ platform: rowPlatform, group_id: groupId, name: groupId });
    }
  }
  return rows;
}

function selectedTargets() {
  const rows = [...state.selectedTargets.values()];
  const seen = new Set(rows.map((row) => `${row.platform}\u0000${row.group_id}`));
  for (const row of parseManualTargets()) {
    const key = `${row.platform}\u0000${row.group_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function updateSelectionSummary() {
  const songs = state.selectedItems.size;
  const groups = selectedTargets().length;
  el("selection-summary").textContent = songs
    ? `已选 ${songs} 首 · ${groups} 个群`
    : "未选择歌曲";
  el("send").disabled = state.sending || !songs || !groups;
}

function renderGroups() {
  const host = el("groups");
  const filter = safeText(el("group-filter").value).trim().toLowerCase();
  host.replaceChildren();
  const platforms = state.platforms.filter((row) => row.groups?.length);
  if (!platforms.length) {
    const p = document.createElement("p");
    p.className = "empty";
    const errors = state.platforms.map((row) => row.error).filter(Boolean);
    p.textContent = errors.length
      ? errors.join("；")
      : "当前没有可读取的群列表，可手动填写群号。";
    host.append(p);
    return;
  }
  for (const platform of platforms) {
    const rows = platform.groups.filter((group) => {
      if (!filter) return true;
      return (
        safeText(group.name).toLowerCase().includes(filter) ||
        safeText(group.group_id).toLowerCase().includes(filter)
      );
    });
    if (!rows.length) continue;
    const title = document.createElement("p");
    title.className = "platform-title";
    title.textContent = platform.name || platform.platform;
    host.append(title);
    for (const group of rows) {
      const key = targetKey(platform.platform, group.group_id);
      const label = document.createElement("label");
      label.className = "group-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.selectedTargets.has(key);
      input.addEventListener("change", () => {
        if (input.checked) {
          state.selectedTargets.set(key, {
            platform: platform.platform,
            group_id: group.group_id,
            name: group.name || group.group_id,
          });
        } else {
          state.selectedTargets.delete(key);
        }
        updateSelectionSummary();
      });
      const text = document.createElement("span");
      text.textContent = group.name || group.group_id;
      const id = document.createElement("span");
      id.className = "group-id";
      id.textContent = ` · ${group.group_id}`;
      text.append(id);
      label.append(input, text);
      host.append(label);
    }
  }
  if (!host.childNodes.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "没有匹配的群。";
    host.append(p);
  }
}

function renderPlatformSelect() {
  const select = el("manual-platform");
  select.replaceChildren();
  for (const platform of state.platforms) {
    const option = document.createElement("option");
    option.value = platform.platform;
    option.textContent = `${platform.name || platform.platform} (${platform.platform})`;
    select.append(option);
  }
}

async function loadGroups() {
  const button = el("refresh-groups");
  setBusy(button, true);
  try {
    const data = await bridge.apiGet("library/groups");
    state.platforms = Array.isArray(data?.platforms) ? data.platforms : [];
    renderPlatformSelect();
    renderGroups();
  } catch (error) {
    showError(`读取群列表失败：${error.message || error}`);
  } finally {
    setBusy(button, false);
  }
}

function renderResults() {
  const host = el("results");
  host.replaceChildren();
  const items = state.items;
  el("result-summary").textContent = items.length
    ? `共 ${items.length} 首，可勾选后发送`
    : "没有结果";
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "没有匹配的本地曲库歌曲。";
    host.append(p);
    updateSelectionSummary();
    return;
  }
  for (const item of items) {
    const row = document.createElement("label");
    row.className = `song${item.available ? "" : " unavailable"}`;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = state.selectedItems.has(item.id);
    check.disabled = !item.available;
    check.addEventListener("change", () => {
      if (check.checked) state.selectedItems.add(item.id);
      else state.selectedItems.delete(item.id);
      updateSelectionSummary();
    });
    const cover = document.createElement("img");
    cover.className = "cover";
    cover.alt = "";
    cover.loading = "lazy";
    cover.referrerPolicy = "no-referrer";
    if (item.cover) {
      cover.src = item.cover;
      cover.addEventListener("error", () => cover.removeAttribute("src"));
    }
    const main = document.createElement("div");
    main.className = "song-main";
    const title = document.createElement("p");
    title.className = "song-title";
    title.textContent = item.title;
    const meta = document.createElement("p");
    meta.className = "song-meta";
    meta.textContent = [item.artist, item.album, formatDuration(item.duration)]
      .filter(Boolean)
      .join(" · ");
    main.append(title, meta);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = item.available
      ? [item.quality, item.source].filter(Boolean).join(" · ")
      : "文件缺失";
    row.append(check, cover, main, tag);
    host.append(row);
  }
  updateSelectionSummary();
}

async function search() {
  const button = el("search");
  setBusy(button, true);
  try {
    const data = await bridge.apiGet("library/search", {
      q: el("query").value.trim(),
      limit: Number(el("limit").value) || 50,
    });
    state.items = Array.isArray(data?.items) ? data.items : [];
    state.selectedItems.clear();
    renderResults();
  } catch (error) {
    showError(`搜索失败：${error.message || error}`);
    state.items = [];
    state.selectedItems.clear();
    renderResults();
  } finally {
    setBusy(button, false);
  }
}

function renderJob(job) {
  const box = el("job");
  box.classList.remove("hidden");
  box.replaceChildren();
  const pct = job.total ? Math.min(100, (job.done / job.total) * 100) : 0;
  const bar = document.createElement("div");
  bar.className = "progress";
  const fill = document.createElement("span");
  fill.style.width = `${pct}%`;
  bar.append(fill);
  box.append(bar);
  const line = document.createElement("p");
  line.className = "job-line";
  const labels = {
    queued: "排队中",
    running: "发送中",
    done: "已完成",
    error: "任务失败",
    cancelled: "已取消",
  };
  line.textContent = `${labels[job.status] || job.status} · ${job.done}/${job.total}`;
  box.append(line);
  if (job.error) {
    const error = document.createElement("p");
    error.className = "job-line error";
    error.textContent = job.error;
    box.append(error);
  }
  const list = document.createElement("div");
  list.className = "result-list";
  for (const row of job.results || []) {
    const wrap = document.createElement("div");
    wrap.className = "result-row";
    const dot = document.createElement("span");
    dot.className = `dot${row.ok ? " ok" : ""}`;
    const text = document.createElement("span");
    text.textContent = `${row.title || row.itemId} → ${row.groupName || row.groupId}${
      row.ok ? "：已发送" : `：${row.reason || "失败"}`
    }`;
    wrap.append(dot, text);
    list.append(wrap);
  }
  box.append(list);
}

async function pollJob() {
  if (!state.jobId) return;
  try {
    const job = await bridge.apiGet("library/job", { id: state.jobId });
    renderJob(job);
    if (["done", "error", "cancelled"].includes(job.status)) {
      state.sending = false;
      setBusy(el("send"), false);
      updateSelectionSummary();
      return;
    }
  } catch (error) {
    showError(`读取发送进度失败：${error.message || error}`);
    state.sending = false;
    updateSelectionSummary();
    return;
  }
  state.pollTimer = window.setTimeout(pollJob, 900);
}

async function sendSelected() {
  if (state.sending) return;
  const ids = [...state.selectedItems];
  const targets = selectedTargets();
  if (!ids.length) return showError("请至少选择一首歌曲。");
  if (!targets.length) return showError("请至少选择一个群。");
  state.sending = true;
  setBusy(el("send"), true);
  try {
    const data = await bridge.apiPost("library/send", { ids, targets });
    state.jobId = data.jobId;
    const box = el("job");
    box.replaceChildren();
    const line = document.createElement("p");
    line.className = "job-line";
    line.textContent = `已开始发送：${data.songs} 首 × ${data.groups} 个群`;
    box.append(line);
    box.classList.remove("hidden");
    pollJob();
  } catch (error) {
    state.sending = false;
    setBusy(el("send"), false);
    showError(`发送失败：${error.message || error}`);
  }
}

async function main() {
  await bridge.ready();
  el("search").addEventListener("click", search);
  el("query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") search();
  });
  el("refresh-latest").addEventListener("click", () => {
    el("query").value = "";
    search();
  });
  el("refresh-groups").addEventListener("click", loadGroups);
  el("group-filter").addEventListener("input", renderGroups);
  el("manual-groups").addEventListener("input", updateSelectionSummary);
  el("manual-platform").addEventListener("change", updateSelectionSummary);
  el("select-all").addEventListener("click", () => {
    for (const item of state.items) {
      if (item.available) state.selectedItems.add(item.id);
    }
    renderResults();
  });
  el("clear-selection").addEventListener("click", () => {
    state.selectedItems.clear();
    renderResults();
  });
  el("send").addEventListener("click", sendSelected);
  await Promise.all([loadGroups(), search()]);
}

main().catch((error) => showError(error.message || String(error)));
