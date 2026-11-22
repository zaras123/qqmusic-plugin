const host = window.AstrBotPluginView || window.AstrBotPluginPage || null;

function errorOf(message, status = 0, code = "") {
  const error = new Error(message || "请求失败");
  error.status = status;
  error.code = code;
  return error;
}

function parseQuery(path) {
  const index = String(path).indexOf("?");
  return index >= 0 ? new URLSearchParams(String(path).slice(index + 1)) : new URLSearchParams();
}

async function request(path, options = {}) {
  if (!host) throw errorOf("AstrBot WebUI bridge 未加载");
  const plain = String(path);
  try {
    if (plain === "groups") return await host.apiGet("library/groups");
    if (plain.startsWith("search")) {
      const query = parseQuery(plain);
      return await host.apiGet("library/search", {
        q: query.get("q") || "",
        limit: Number(query.get("limit")) || 50,
      });
    }
    if (plain === "send") {
      const body = options.body ? JSON.parse(options.body) : {};
      return await host.apiPost("library/send", body);
    }
    if (plain.startsWith("job")) {
      const query = parseQuery(plain);
      const data = await host.apiGet("library/job", { id: query.get("id") || "" });
      return data && data.id && !data.job ? { job: data } : data;
    }
  } catch (raw) {
    const error = raw instanceof Error ? raw : errorOf(String(raw));
    const payload = error.payload || error.data || {};
    if (!error.code && payload && typeof payload === "object") {
      error.code = payload.code || "";
    }
    if (!error.code && String(error.message || "").includes("TOKEN_REQUIRED")) {
      error.code = "TOKEN_REQUIRED";
    }
    throw error;
  }
  throw errorOf(`未知接口：${plain}`);
}

window.QQMusicBridge = {
  platformLabel: "ASTRBOT / PLUGINS / QQMUSIC",
  themeKey: "qqmusic.astrbot.theme",
  storageKey: "qqmusic.astrbot.job",
  request,
  async getApiConfig() {
    if (!host) throw errorOf("AstrBot WebUI bridge 未加载");
    return await host.apiGet("library/api-config");
  },
  async saveApiConfig(payload) {
    if (!host) throw errorOf("AstrBot WebUI bridge 未加载");
    return await host.apiPost("library/api-config", payload || {});
  },
  openSettings() {
    location.href = "./settings.html";
  },
  async ready() {
    if (host && typeof host.ready === "function") await host.ready();
  },
};
