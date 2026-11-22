const token = new URLSearchParams(location.search).get("token") || "";

async function request(path, options = {}) {
  const url = new URL(`./api/${path}`, location.href);
  url.searchParams.set("token", token);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
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
    const error = new Error(data.error || `请求失败（HTTP ${res.status}）`);
    error.status = res.status;
    error.code = data.code || "";
    throw error;
  }
  return data;
}

window.QQMusicBridge = {
  platformLabel: "YUNZAI / GUOBA / QQMUSIC",
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
