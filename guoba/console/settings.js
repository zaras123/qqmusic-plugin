const bridge = window.QQMusicBridge || {};
const $ = (id) => document.getElementById(id);
const THEME_KEY = bridge.themeKey || "qqmusic.console.theme";

function storeGet(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function storeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* iframe sandbox 下忽略 */
  }
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

function setStatus(text, bad = false) {
  const pill = $("status-pill");
  pill.textContent = text;
  pill.classList.toggle("bad", Boolean(bad));
}

async function loadConfig() {
  $("settings-status").textContent = "正在读取 API 配置…";
  try {
    const data = await bridge.getApiConfig();
    const configured = Boolean(data.hasToken || data.apiToken);
    $("api-base").value = String(data.apiBase || "");
    $("api-token").value = String(data.apiToken || "");
    $("settings-status").textContent = configured
      ? "已配置 API Token；保存后立即生效。"
      : "还没有配置 API Token，填写后保存。";
    setStatus(configured ? "已连接" : "未配置 Token", !configured);
  } catch (error) {
    setStatus("读取失败", true);
    $("settings-status").textContent = `读取失败：${error.message || error}`;
  }
}

async function saveConfig() {
  const button = $("save-settings");
  button.disabled = true;
  $("settings-status").textContent = "正在保存…";
  try {
    const data = await bridge.saveApiConfig({
      apiBase: $("api-base").value.trim(),
      apiToken: $("api-token").value.trim(),
    });
    $("settings-status").textContent = data.message || "保存成功";
    setStatus("已保存");
    await loadConfig();
  } catch (error) {
    setStatus("保存失败", true);
    $("settings-status").textContent = `保存失败：${error.message || error}`;
  } finally {
    button.disabled = false;
  }
}

function bind() {
  $("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    storeSet(THEME_KEY, next);
    applyTheme(next);
  });
  $("back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "./index.html";
  });
  $("save-settings").addEventListener("click", saveConfig);
}

async function main() {
  applyTheme(storeGet(THEME_KEY) || parentTheme());
  bind();
  if (typeof bridge.getApiConfig !== "function") {
    setStatus("连接失败", true);
    $("settings-status").textContent = "当前框架的 WebUI bridge 未提供 API 配置接口。";
    return;
  }
  await loadConfig();
}

main().catch((error) => {
  setStatus("连接失败", true);
  $("settings-status").textContent = error.message || String(error);
});
