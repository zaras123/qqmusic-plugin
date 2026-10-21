/**
 * 账号写操作（qqmusic-api-enhanced 2026-10 新增 24 个写接口）
 *
 *   #qqm歌单新建 / #qqm歌单删除 / #qqm歌单加歌 / #qqm歌单删歌
 *   #qqm喜欢歌曲 / #qqm取消喜欢 / #qqm收藏歌单 / #qqm收藏歌单取消
 *   #qqm收藏专辑 / #qqm收藏专辑取消
 *   #qqm不喜欢 / #qqm取消不喜欢 / #qqm清空不喜欢
 *   #qqm发评论 / #qqm删评论
 *   #qqm音响力点赞 / #qqm音响力取消点赞 / #qqm音响力隐私
 *   #qqm私信发送 / #qqm私信删除会话 / #qqm私信删除消息 / #qqm私信清空会话 /
 *   #qqm私信设置 / #qqm私信全部已读 / #qqm私信卡片操作
 *
 * ⚠️ 与 utils/command.js 顶部同一条仓库纪律：本文件**只许导出插件类**，
 *    解析逻辑一律放 utils/manage.js（纯函数，test.mjs 直接跑）。
 *
 * ⚠️ 所有命令都必须带确认词（`确认` / `confirm`）才执行。这里是**真人**操作的
 *    账号数据，误触不可逆；API 侧的 confirm=1 是第二道闸，插件侧这道是给用户看的。
 */
import { loadPluginBase } from '../utils/plugin-base.js';
// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase();
import { songlistCreate, songlistDelete, songlistAddSongs, songlistDelSongs, songlistLike, songlistUnlike, userFavSonglistWrite, userUnfavSonglistWrite, userFavAlbumWrite, userUnfavAlbumWrite, userAddDislike, userCancelDislike, userCancelAllDislike, commentAdd, commentDelete, soundpowerLike, soundpowerPrivacy, privateMsgSend, privateMsgDeleteSession, privateMsgDeleteMessage, privateMsgClearSession, privateMsgSetConfig, privateMsgMarkAllRead, privateMsgCardAction, } from '../utils/api.js';
import { MANAGE_USAGE, upstreamWriteError, parsePlaylistCmd, parseDislikeCmd, parseCommentCmd, parseSoundPowerCmd, parsePrivateMsgCmd, } from '../utils/manage.js';
import { buildManageCardData } from '../utils/help-card.js';
import { renderGuideCard } from '../utils/render.js';
import { getCfg, replyCardOrText } from '../utils/common.js';
import { logError } from '../utils/log.js';
/**
 * 写操作统一收口：拿 userKey、判空、错误翻译。
 *
 * 写接口**一律按请求者本人**（api.ts 里 asUser: true），所以这里只传 e.user_id。
 * 没有单独做"先查登录状态"的预检：多打一轮 `/login/status` 没必要，
 * API 写接口自己会回"未登录"，错误翻译统一在这里给用户看。
 */
async function runWrite(e, fn) {
    const userKey = String(e.userId || e.user_id || '');
    try {
        const body = await fn(userKey);
        const data = body?.data ?? body ?? {};
        const upstreamError = upstreamWriteError(data);
        if (upstreamError)
            return { ok: false, reply: `操作失败：${upstreamError}` };
        return { ok: true, data };
    }
    catch (err) {
        const msg = String(err?.message || '');
        if (/登录|login|musicKey|未登录/i.test(msg) || err?.code === -1) {
            return { ok: false, reply: '该操作需要登录，请先 #qqm登录 后重试' };
        }
        return { ok: false, reply: `操作失败：${msg || '未知错误'}` };
    }
}
/** 成功时 API 大多回 {} 或 { code: 0 }，统一回一句明确的"已执行" */
async function replyWrite(e, result, successText) {
    if (!result.ok) {
        await e.reply(result.reply);
        return true;
    }
    await e.reply(successText);
    return true;
}
export class qqmusicManage extends (await loadPluginBase()) {
    constructor() {
        super({
            name: 'QQ音乐-账号操作',
            desc: '歌单、收藏、评论、不喜欢、音响力、私信账号操作（仅主人）',
            event: 'message',
            priority: 505,
            rule: [
                { reg: /^#?(?:qq|QQ)m\s*(?:歌单新建|新建歌单|歌单删除|删除歌单|解散歌单|歌单加歌|歌单添加|添加歌曲|歌单删歌|歌单移除|移除歌曲|喜欢歌曲|收藏歌曲|取消喜欢|取消收藏歌曲|收藏专辑取消|取消收藏专辑|专辑取消收藏|收藏专辑|专辑收藏|收藏歌单取消|取消收藏歌单|歌单取消收藏|收藏歌单|歌单收藏)\s+[\s\S]+$/, fnc: 'playlistWrite', permission: 'master' },
                { reg: /^#?(?:qq|QQ)m\s*(?:清空不喜欢|取消全部不喜欢|不喜欢清空|取消不喜欢歌曲|取消不喜欢单曲|取消不喜欢歌手|取消不喜欢艺人|取消不喜欢风格|取消不喜欢曲风|取消不喜欢|不喜欢歌曲|不喜欢单曲|不喜欢歌手|不喜欢艺人|不喜欢风格|不喜欢曲风|不喜欢)\s+[\s\S]+$/, fnc: 'dislikeWrite', permission: 'master' },
                { reg: /^#?(?:qq|QQ)m\s*(?:发评论|评论发布|发布评论|删评论|删除评论|评论删除)\s+[\s\S]+$/, fnc: 'commentWrite', permission: 'master' },
                { reg: /^#?(?:qq|QQ)m\s*(?:音响力隐私|排行榜隐私|音响力设置|音响力取消点赞|取消音响力点赞|音响力点赞|点赞好友)\s+[\s\S]+$/, fnc: 'soundpowerWrite', permission: 'master' },
                { reg: /^#?(?:qq|QQ)m\s*(?:私信发送|发送私信|私信删除会话|删除私信会话|私信删除消息|删除私信消息|私信清空会话|清空私信会话|私信清空|私信设置|设置私信|私信全部已读|私信标记已读|私信卡片操作|私信卡片)\s+[\s\S]+$/, fnc: 'privateWrite', permission: 'master' },
                // 写操作总入口提示（不带子命令时回用法，别让用户猜）
                { reg: /^#?(?:qq|QQ)m\s*(?:账号操作|账号帮助|写操作|写帮助)$/, fnc: 'usage', permission: 'master' },
            ],
        });
    }
    cfg() { return getCfg(); }
    /** 总用法提示 */
    async usage(e) {
        const cfg = this.cfg();
        if (!cfg.enable)
            return false;
        await replyCardOrText(e, {
            render: renderGuideCard,
            data: buildManageCardData(e),
            formatText: () => MANAGE_USAGE,
            tag: '账号操作卡片',
        });
        return true;
    }
    // ──────────── 歌单 / 收藏 ────────────
    async playlistWrite(e) {
        const cfg = this.cfg();
        if (!cfg.enable)
            return false;
        const p = parsePlaylistCmd(e.msg);
        if (!p.action)
            return false;
        if (!p.ok) {
            await e.reply(p.usage ? `⚠️ ${p.usage}` : `⚠️ 请带上确认词，例如 #qqm喜欢歌曲 123:1 确认`);
            return true;
        }
        switch (p.action) {
            case 'playlistCreate':
                return replyWrite(e, await runWrite(e, (k) => songlistCreate(p.name, k)), `已新建歌单「${p.name}」`);
            case 'playlistDelete':
                return replyWrite(e, await runWrite(e, (k) => songlistDelete(p.dirId, k)), `已删除歌单 dirId=${p.dirId}`);
            case 'playlistAddSongs':
                return replyWrite(e, await runWrite(e, (k) => songlistAddSongs(p.dirId, p.songs, { userKey: k })), `已加 ${p.songs.length} 首到歌单 dirId=${p.dirId}`);
            case 'playlistDelSongs':
                return replyWrite(e, await runWrite(e, (k) => songlistDelSongs(p.dirId, p.songs, { userKey: k })), `已从歌单 dirId=${p.dirId} 移除 ${p.songs.length} 首`);
            case 'likeSong':
                return replyWrite(e, await runWrite(e, (k) => songlistLike(p.songs, k)), `已收藏 ${p.songs.length} 首进「我喜欢」`);
            case 'unlikeSong':
                return replyWrite(e, await runWrite(e, (k) => songlistUnlike(p.songs, k)), `已从「我喜欢」移除 ${p.songs.length} 首`);
            case 'favSonglist':
                return replyWrite(e, await runWrite(e, (k) => userFavSonglistWrite(p.ids, k)), `已收藏 ${p.ids.length} 个歌单`);
            case 'unfavSonglist':
                return replyWrite(e, await runWrite(e, (k) => userUnfavSonglistWrite(p.ids, k)), `已取消收藏 ${p.ids.length} 个歌单`);
            case 'favAlbum':
                return replyWrite(e, await runWrite(e, (k) => userFavAlbumWrite(p.ids, k)), `已收藏 ${p.ids.length} 张专辑`);
            case 'unfavAlbum':
                return replyWrite(e, await runWrite(e, (k) => userUnfavAlbumWrite(p.ids, k)), `已取消收藏 ${p.ids.length} 张专辑`);
            default:
                return false;
        }
    }
    // ──────────── 不喜欢 ────────────
    async dislikeWrite(e) {
        const cfg = this.cfg();
        if (!cfg.enable)
            return false;
        const p = parseDislikeCmd(e.msg);
        if (!p.action)
            return false;
        if (!p.ok) {
            await e.reply(`⚠️ ${p.usage || '请带上确认词，例如 #qqm不喜欢 歌曲 123 确认'}`);
            return true;
        }
        if (p.action === 'cancelAllDislike') {
            return replyWrite(e, await runWrite(e, (k) => userCancelAllDislike(k)), '已清空「不喜欢」歌曲');
        }
        const label = p.type === 1 ? '歌曲' : p.type === 2 ? '歌手' : '风格';
        if (p.action === 'addDislike') {
            return replyWrite(e, await runWrite(e, (k) => userAddDislike(p.type, p.ids, k)), `已把 ${p.ids.length} 个${label}加入不喜欢`);
        }
        return replyWrite(e, await runWrite(e, (k) => userCancelDislike(p.type, p.ids, k)), `已取消 ${p.ids.length} 个${label}的不喜欢`);
    }
    // ──────────── 评论 ────────────
    async commentWrite(e) {
        const cfg = this.cfg();
        if (!cfg.enable)
            return false;
        const p = parseCommentCmd(e.msg);
        if (!p.action)
            return false;
        if (!p.ok) {
            await e.reply(`⚠️ ${p.usage || '请带上确认词，例如 #qqm发评论 歌曲 123 好听 确认'}`);
            return true;
        }
        if (p.action === 'commentDelete') {
            return replyWrite(e, await runWrite(e, (k) => commentDelete(p.cmId, k)), `已删除评论 ${p.cmId}`);
        }
        return replyWrite(e, await runWrite(e, (k) => commentAdd(p.bizId, p.content, { biztype: p.biztype, userKey: k })), `已发布评论到 biztype=${p.biztype} id=${p.bizId}`);
    }
    // ──────────── 音响力 ────────────
    async soundpowerWrite(e) {
        const cfg = this.cfg();
        if (!cfg.enable)
            return false;
        const p = parseSoundPowerCmd(e.msg);
        if (!p.action)
            return false;
        if (!p.ok) {
            await e.reply(`⚠️ ${p.usage || '请带上确认词'}`);
            return true;
        }
        if (p.action === 'soundpowerPrivacy') {
            return replyWrite(e, await runWrite(e, (k) => soundpowerPrivacy(p.status, k)), p.status === 1 ? '已将音响力排行榜设为隐藏' : '已将音响力排行榜设为公开');
        }
        const cancel = p.action === 'soundpowerUnlike';
        return replyWrite(e, await runWrite(e, (k) => soundpowerLike(p.uin, { cancel, userKey: k })), cancel ? `已取消给 ${p.uin} 的音响力点赞` : `已给 ${p.uin} 的音响力点赞`);
    }
    // ──────────── 私信 ────────────
    async privateWrite(e) {
        const cfg = this.cfg();
        if (!cfg.enable)
            return false;
        const p = parsePrivateMsgCmd(e.msg);
        if (!p.action)
            return false;
        if (!p.ok) {
            await e.reply(`⚠️ ${p.usage || '请带上确认词'}`);
            return true;
        }
        const a = p.args || {};
        switch (p.action) {
            case 'privateSend':
                return replyWrite(e, await runWrite(e, (k) => privateMsgSend(a.userId, a.msgType, a.content, { userKey: k })), `已发送私信给 ${a.userId}`);
            case 'privateDeleteSession':
                return replyWrite(e, await runWrite(e, (k) => privateMsgDeleteSession(a.sessionId, k)), '已删除该私信会话');
            case 'privateDeleteMessage':
                return replyWrite(e, await runWrite(e, (k) => privateMsgDeleteMessage(a.sessionId, a.msgId, k)), '已删除该条私信');
            case 'privateClearSession':
                return replyWrite(e, await runWrite(e, (k) => privateMsgClearSession(a.sessionId, k)), '已清空该私信会话');
            case 'privateSetConfig':
                return replyWrite(e, await runWrite(e, (k) => privateMsgSetConfig(a.configType, a.configValue, k)), '已写入私信配置');
            case 'privateMarkAllRead':
                return replyWrite(e, await runWrite(e, (k) => privateMsgMarkAllRead(a.encryptUin, { cmdFlag: a.cmdFlag, userKey: k })), '已把私信标记为全部已读');
            case 'privateCardAction':
                return replyWrite(e, await runWrite(e, (k) => privateMsgCardAction(a.targetUserId, a.msgType, a.msgId, { value: a.value, userKey: k })), '已执行卡片消息操作');
            default:
                logError(`未知写操作: ${p.action}`);
                return false;
        }
    }
}
//# sourceMappingURL=manage.js.map