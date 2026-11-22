const API_BASE = "/api/v1/plugin/qqmusic";
const AUTH_KEY = "accessToken";
const USER_KEY = "userId";

function queryValue(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

function storeGet(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

async function request(path, options = {}) {
  const url = `${API_BASE}/${String(path)}`;
  const headers = { "Content-Type": "application/json" };
  const token = queryValue("token") || storeGet(AUTH_KEY);
  const userId = queryValue("uid") || queryValue("userId") || storeGet(USER_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers["x-user-id"] = userId;
  const res = await fetch(url, {
    headers,
    cache: "no-store",
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    const error = new Error(data.error || data.message || `请求失败（HTTP ${res.status}）`);
    error.status = res.status;
    error.code = data.code || "";
    throw error;
  }
  return data;
}

window.QQMusicBridge = {
  platformLabel: "KARIN / PLUGINS / QQMUSIC",
  themeKey: "qqmusic.console.theme",
  storageKey: "qqmusic.console.job",
  request,
  async getApiConfig() {
    return request("api-config");
  },
  async saveApiConfig(payload) {
    return request("api-config", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  openSettings() {
    location.href = "./settings.html";
  },
  async ready() {},
};
