/**
 * Karin WebUI 本地曲库点歌。
 *
 * 原生配置表单没有按钮组件，所以用「操作」下拉 + 保存触发：
 *   search → 返回曲库列表；send → 后台发送；status → 返回上次进度。
 * 音频地址只在后台按 libraryId 重新取，不回传浏览器。
 */
import Config from '../components/Config.js';
import { request, pickPlayUserKey, libraryItemPlay } from './api.js';
import { groupEventOf } from './bridge.js';
import { logInfo, logWarn } from './log.js';
const MAX_SEARCH = 200;
const MAX_PREVIEW = 10;
const MAX_SEND_ITEMS = 50;
const GROUP_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
let lastSearch = { q: '', items: [], total: 0, at: 0 };
let lastSend = null;
let sending = false;
const knownItems = new Map();
export function hasApiToken() {
    const cfg = Config.getConfig('qqmusic') || {};
    return Boolean(String(cfg.apiToken || cfg.api_token || process.env.QQMUSIC_API_TOKEN || '').trim());
}
export function assertApiToken() {
    if (hasApiToken())
        return;
    const error = new Error('还没有配置 API Token，请先在插件设置里填写后再搜索本地曲库');
    error.code = 'TOKEN_REQUIRED';
    throw error;
}
export function getLibraryItem(id) {
    return knownItems.get(String(id || '')) || null;
}
export function rememberLibraryItems(items) {
    for (const item of items || []) {
        if (item?.id)
            knownItems.set(String(item.id), item);
    }
    while (knownItems.size > 1000)
        knownItems.delete(knownItems.keys().next().value);
}
export function mapLibraryItem(raw = {}) {
    const status = String(raw.status || '');
    const available = raw.filePresent !== false && !['missing', 'quarantined'].includes(status);
    return {
        id: String(raw.id || ''),
        songmid: String(raw.songmid || ''),
        title: String(raw.title || raw.songName || raw.songmid || '未知歌曲'),
        artist: String(raw.artist || raw.singerName || '未知歌手'),
        album: String(raw.album || ''),
        duration: Math.max(0, Number(raw.duration) || 0),
        quality: String(raw.quality || ''),
        source: String(raw.source || ''),
        cover: String(raw.cover || ''),
        bytes: Math.max(0, Number(raw.bytes) || 0),
        available,
        status,
    };
}
export function normalizeTargets(raw) {
    const values = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,，;；]+/);
    const out = [];
    const seen = new Set();
    for (const value of values) {
        let platform = '';
        let uin = '';
        let name = '';
        let id = '';
        if (value && typeof value === 'object') {
            platform = String(value.platform || '').trim();
            uin = String(value.uin ?? value.bot ?? value.preferUin ?? '').trim();
            name = String(value.name || '').trim();
            id = String(value.group_id ?? value.groupId ?? value.id ?? '').trim();
        }
        else {
            const text = String(value || '').trim();
            const parts = text.split('|');
            if (parts.length >= 3) {
                platform = parts[0].trim();
                uin = parts[1].trim();
                id = parts.slice(2).join('|').trim();
            }
            else if (parts.length === 2) {
                platform = parts[0].trim();
                id = parts[1].trim();
            }
            else {
                id = text;
            }
        }
        if (!uin && platform.includes(':'))
            uin = platform.split(':').pop().trim();
        const key = `${platform}\u0000${uin}\u0000${id}`;
        if (!GROUP_RE.test(id) || seen.has(key))
            continue;
        seen.add(key);
        out.push({ platform, uin, group_id: id, name });
    }
    return out;
}
export function normalizeGroupIds(raw) {
    return normalizeTargets(raw)
        .map((target) => target.group_id)
        .filter((id) => /^\d{5,20}$/.test(id));
}
export function normalizePick(raw, count = 0) {
    const n = Math.trunc(Number(raw) || 1);
    if (!Number.isFinite(n) || n < 1)
        return 1;
    return count > 0 ? Math.min(n, count) : n;
}
export function formatSearchMessage(result) {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (!items.length) {
        return result?.q
            ? `本地曲库没有匹配「${result.q}」的歌曲。`
            : '本地曲库暂时没有可播放的歌曲。';
    }
    const lines = [
        `本地曲库：找到 ${result.total || items.length} 首${result.q ? `（关键词：${result.q}）` : '（最新入库）'}`,
    ];
    for (const [index, item] of items.slice(0, MAX_PREVIEW).entries()) {
        const quality = item.quality ? ` · ${item.quality}` : '';
        lines.push(`${index + 1}. ${item.title} - ${item.artist}${quality}${item.available ? '' : '（文件缺失）'}`);
    }
    if (items.length > MAX_PREVIEW)
        lines.push(`……只显示前 ${MAX_PREVIEW} 首`);
    lines.push('把序号填到「发送第几首」，群号填到「目标群号」，操作选「发送」，再点保存。');
    return lines.join('\n');
}
export function formatSendStatus(job = lastSend) {
    if (!job)
        return '还没有通过 WebUI 发送过本地曲库歌曲。';
    const status = job.status === 'running' ? '发送中' : job.status === 'done' ? '已完成' : '任务异常';
    const lines = [`本地曲库发送：${status} · ${job.done || 0}/${job.total || 0}`, `任务：${job.id}`];
    for (const row of (job.results || []).slice(-12)) {
        const target = [row.groupName || row.groupId, row.platform].filter(Boolean).join(' · ');
        lines.push(`${row.ok ? '✅' : '❌'} ${target} · ${row.title}${row.ok ? '' : `：${row.reason || '失败'}`}`);
    }
    if (job.results?.length > 12)
        lines.push('……只显示最近 12 条');
    return lines.join('\n');
}
export async function searchLocalLibrary({ query = '', limit = 30, userKey = '' } = {}) {
    assertApiToken();
    const cfg = Config.getConfig('qqmusic') || {};
    if (cfg.localLibrary === false)
        throw new Error('本地曲库已关闭');
    const safeLimit = Math.max(1, Math.min(MAX_SEARCH, Number(limit) || 30));
    const body = await request('/library/list', { q: String(query || '').trim(), limit: safeLimit, offset: 0 }, 'get', userKey || pickPlayUserKey(''));
    const data = body?.data || body || {};
    const items = (Array.isArray(data.items) ? data.items : [])
        .map(mapLibraryItem)
        .filter((item) => /^lib_[a-z0-9]+$/i.test(item.id));
    lastSearch = {
        q: String(query || '').trim(),
        items,
        total: Number(data.total) || items.length,
        at: Date.now(),
    };
    rememberLibraryItems(items);
    return lastSearch;
}
function songOf(item) {
    return {
        songmid: item.songmid || item.id,
        songName: item.title,
        singerName: item.artist,
        albumName: item.album,
        interval: item.duration,
        cover: item.cover,
        source: item.source || 'library',
        local: true,
        libraryId: item.id,
    };
}
export function startLibrarySend({ groups = [], targets = null, pick = 1, items = null, userId = '', } = {}) {
    if (sending)
        throw new Error('已有本地曲库发送任务在进行，请稍后再试');
    const selected = (Array.isArray(items) && items.length
        ? items
        : [lastSearch.items[normalizePick(pick, lastSearch.items.length) - 1]])
        .filter(Boolean)
        .slice(0, MAX_SEND_ITEMS);
    if (!selected.length)
        throw new Error('没有可发送的曲库结果，请先搜索');
    const targetList = normalizeTargets(targets ?? groups);
    if (!targetList.length)
        throw new Error('请填写至少一个有效群号');
    const job = {
        id: `libweb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'running',
        total: selected.length * targetList.length,
        done: 0,
        results: [],
        startedAt: Date.now(),
        finishedAt: 0,
    };
    lastSend = job;
    sending = true;
    void (async () => {
        try {
            const { deliverSong } = await import('./send.js');
            for (const item of selected) {
                let play;
                try {
                    play = await libraryItemPlay(item.id, { userKey: pickPlayUserKey('') });
                }
                catch (err) {
                    for (const target of targetList) {
                        job.results.push({
                            itemId: item.id,
                            platform: target.platform,
                            groupId: target.group_id,
                            groupName: target.name || target.group_id,
                            title: item.title,
                            ok: false,
                            reason: `取本地音频失败：${err?.message || err}`,
                        });
                        job.done += 1;
                    }
                    continue;
                }
                const song = songOf(item);
                for (const target of targetList) {
                    const e = await groupEventOf({
                        groupId: target.group_id,
                        preferUin: target.uin,
                        userId,
                    });
                    if (!e) {
                        job.results.push({
                            itemId: item.id,
                            platform: target.platform,
                            groupId: target.group_id,
                            groupName: target.name || target.group_id,
                            title: item.title,
                            ok: false,
                            reason: 'bot 不在线或不在该群',
                        });
                        job.done += 1;
                        continue;
                    }
                    try {
                        const out = await deliverSong(e, song, play);
                        job.results.push({
                            itemId: item.id,
                            platform: target.platform,
                            groupId: target.group_id,
                            groupName: target.name || target.group_id,
                            title: item.title,
                            ok: out?.ok !== false,
                            reason: out?.ok === false ? out.reason || '发送失败' : '',
                        });
                    }
                    catch (err) {
                        job.results.push({
                            itemId: item.id,
                            platform: target.platform,
                            groupId: target.group_id,
                            groupName: target.name || target.group_id,
                            title: item.title,
                            ok: false,
                            reason: err?.message || String(err),
                        });
                    }
                    job.done += 1;
                }
            }
            job.status = 'done';
            logInfo(`[qqmusic] WebUI 本地曲库发送完成：${job.done}/${job.total}`);
        }
        catch (err) {
            job.status = 'error';
            job.results.push({ groupId: '', title: '任务', ok: false, reason: err?.message || String(err) });
            logWarn(`[qqmusic] WebUI 本地曲库发送失败：${err?.message || err}`);
        }
        finally {
            job.finishedAt = Date.now();
            sending = false;
        }
    })();
    return job;
}
export async function runLibraryWebAction(action, fields = {}) {
    if (action === 'search') {
        const result = await searchLocalLibrary({
            query: fields.qqmusicLibraryQuery || '',
            limit: Math.min(Number(fields.qqmusicLibraryLimit) || MAX_PREVIEW, MAX_PREVIEW),
        });
        return formatSearchMessage(result);
    }
    if (action === 'send') {
        const q = String(fields.qqmusicLibraryQuery || '').trim();
        if (!lastSearch.items.length || lastSearch.q !== q) {
            await searchLocalLibrary({ query: q, limit: 30 });
        }
        const groups = [fields.qqmusicLibraryGroupPick, fields.qqmusicLibraryGroups]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .join(' ');
        const job = startLibrarySend({
            groups,
            pick: fields.qqmusicLibraryPick,
        });
        return `已开始发送 ${job.total} 条。\n任务：${job.id}\n稍后把操作改成「查看进度」再保存即可查看结果。`;
    }
    if (action === 'status')
        return formatSendStatus();
    return '未执行曲库操作。';
}
//# sourceMappingURL=library-web.js.map