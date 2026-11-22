/**
 * Karin 自定义配置页：和 Yunzai / AstrBot 同一套本地曲库投递界面。
 *
 * node-karin 1.18 的 defineConfig({ page }) 只是把同源地址放进插件配置页的
 * iframe，页面和接口要插件自己挂。这里直接用 node-karin 导出的 router：
 *   - /console/qqmusic/        页面（authMiddleware 白名单）
 *   - /plugin/qqmusic/*        接口（沿用 Karin WebUI 登录鉴权）
 */
import fs from 'node:fs';
import path from 'node:path';
import { router } from 'node-karin';
import { pluginPath } from './path.js';
import { normalizeApiBase } from './api.js';
import { listKarinPlatformGroups } from './group-targets.js';
import { getLibraryItem, hasApiToken, normalizeTargets, searchLocalLibrary, startLibrarySend, } from './library-web.js';
import { buildSchemas, getConfigData, setConfigData } from '../web/schemas.js';
import { logInfo, logWarn } from './log.js';
export const CONSOLE_URL = '/api/v1/console-qqmusic/';
const PAGE_ROUTE = '/console-qqmusic';
const API_ROUTE = '/plugin/qqmusic';
const ASSET_DIR = path.join(pluginPath, 'resources/qqmusic-console');
const ASSETS = new Set([
    'index.html',
    'app.js',
    'bridge.js',
    'settings.html',
    'settings.js',
    'style.css',
    'logo.png',
]);
const MAX_SEARCH = 200;
const MAX_JOBS = 40;
const REGISTERED = Symbol.for('qqmusic.karin.console.registered');
const jobs = new Map();
function sendJson(res, status, body) {
    res.status(status);
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
}
function validApiBase(value) {
    if (!value)
        return true;
    try {
        const url = new URL(value);
        return (['http:', 'https:'].includes(url.protocol) &&
            Boolean(url.hostname) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash);
    }
    catch {
        return false;
    }
}
function sendAsset(res, name) {
    const safe = ASSETS.has(name) ? name : '';
    if (!safe)
        return res.status(404).send('not found');
    const file = path.join(ASSET_DIR, safe);
    try {
        if (!fs.existsSync(file))
            return res.status(404).send('not found');
        res.setHeader('Cache-Control', 'no-store');
        return res.sendFile(file);
    }
    catch {
        return res.status(404).send('not found');
    }
}
function publicJob(job) {
    return { ...job, results: Array.isArray(job?.results) ? job.results : [] };
}
function pageAssetName(params) {
    const raw = Array.isArray(params?.splat) ? params.splat.join('/') : params?.splat;
    return String(raw || '').replace(/^\/+/, '') || 'index.html';
}
/**
 * 幂等注册：插件热重载会重新 import 本模块，但 router 是同一个对象。
 */
export function registerQqmusicConsole() {
    if (router[REGISTERED])
        return;
    router[REGISTERED] = true;
    router.get(PAGE_ROUTE, (_req, res) => sendAsset(res, 'index.html'));
    router.get(`${PAGE_ROUTE}/{*splat}`, (req, res) => sendAsset(res, pageAssetName(req.params)));
    router.get(`${API_ROUTE}/groups`, async (_req, res) => {
        try {
            sendJson(res, 200, {
                ok: true,
                platforms: await listKarinPlatformGroups(),
            });
        }
        catch (err) {
            logWarn(`[qqmusic] Karin 控制台读取群列表失败：${err?.message || err}`);
            sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.get(`${API_ROUTE}/config`, async (_req, res) => {
        try {
            sendJson(res, 200, {
                ok: true,
                data: getConfigData(),
                schemas: buildSchemas().filter((schema) => !String(schema.field || '').startsWith('qqmusicLibrary')),
            });
        }
        catch (err) {
            logWarn(`[qqmusic] Karin 控制台读取配置失败：${err?.message || err}`);
            sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.get(`${API_ROUTE}/api-config`, async (_req, res) => {
        try {
            const cfg = getConfigData();
            sendJson(res, 200, {
                ok: true,
                apiBase: normalizeApiBase(cfg.apiBase),
                apiToken: String(cfg.apiToken || ''),
                hasToken: hasApiToken(),
            });
        }
        catch (err) {
            logWarn(`[qqmusic] Karin 控制台读取 API 配置失败：${err?.message || err}`);
            sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.post(`${API_ROUTE}/api-config`, async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const apiBase = normalizeApiBase(body.apiBase);
            if (!validApiBase(apiBase)) {
                return sendJson(res, 400, {
                    ok: false,
                    error: 'API 地址格式不正确，请填写 http/https 地址或裸域名',
                });
            }
            const result = await setConfigData({
                apiBase,
                apiToken: String(body.apiToken || '').trim(),
            });
            if (result?.success === false) {
                return sendJson(res, 400, { ok: false, error: result.message || '保存失败' });
            }
            return sendJson(res, 200, { ok: true, message: result?.message || 'API 配置已保存' });
        }
        catch (err) {
            logWarn(`[qqmusic] Karin 控制台保存 API 配置失败：${err?.message || err}`);
            return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.post(`${API_ROUTE}/config`, async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const result = await setConfigData(body.config || {});
            if (result?.success === false) {
                return sendJson(res, 400, { ok: false, error: result.message || '保存失败' });
            }
            return sendJson(res, 200, { ok: true, message: result?.message || '保存成功' });
        }
        catch (err) {
            logWarn(`[qqmusic] Karin 控制台保存配置失败：${err?.message || err}`);
            return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.get(`${API_ROUTE}/search`, async (req, res) => {
        try {
            const query = String(req.query?.q || '').trim();
            const limit = Math.max(1, Math.min(MAX_SEARCH, Number(req.query?.limit) || 50));
            const result = await searchLocalLibrary({ query, limit });
            sendJson(res, 200, {
                ok: true,
                q: result.q,
                total: result.total,
                items: result.items,
            });
        }
        catch (err) {
            if (err?.code === 'TOKEN_REQUIRED') {
                return sendJson(res, 409, { ok: false, code: 'TOKEN_REQUIRED', error: err.message });
            }
            logWarn(`[qqmusic] Karin 控制台搜索曲库失败：${err?.message || err}`);
            return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.post(`${API_ROUTE}/send`, async (req, res) => {
        try {
            if (!hasApiToken()) {
                return sendJson(res, 409, {
                    ok: false,
                    code: 'TOKEN_REQUIRED',
                    error: '还没有配置 API Token，请先在插件设置里填写后再发送',
                });
            }
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || '')) : [];
            const items = ids.map((id) => getLibraryItem(id)).filter(Boolean);
            if (!items.length) {
                return sendJson(res, 400, {
                    ok: false,
                    error: '曲库结果已过期，请重新搜索后再发送',
                });
            }
            const targets = normalizeTargets(Array.isArray(body.targets) ? body.targets : []);
            if (!targets.length) {
                return sendJson(res, 400, { ok: false, error: '请至少选择一个有效的群' });
            }
            const job = startLibrarySend({ targets, items });
            jobs.set(job.id, job);
            while (jobs.size > MAX_JOBS)
                jobs.delete(jobs.keys().next().value);
            logInfo(`[qqmusic] Karin 控制台开始发送：${items.length} 首 × ${targets.length} 群`);
            return sendJson(res, 200, {
                ok: true,
                jobId: job.id,
                songs: items.length,
                groups: targets.length,
            });
        }
        catch (err) {
            logWarn(`[qqmusic] Karin 控制台发送失败：${err?.message || err}`);
            return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    });
    router.get(`${API_ROUTE}/job`, (req, res) => {
        const id = String(req.query?.id || '');
        const job = jobs.get(id);
        if (!job)
            return sendJson(res, 404, { ok: false, error: '任务不存在或已过期' });
        return sendJson(res, 200, { ok: true, job: publicJob(job) });
    });
    logInfo(`[qqmusic] Karin 独立管理页已注册：${CONSOLE_URL}`);
}
//# sourceMappingURL=console-server.js.map