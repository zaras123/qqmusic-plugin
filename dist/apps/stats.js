/**
 * QQ 音乐「听歌时长统计」
 *   #qqm听歌        我的时长（今日 / 近 7 天 / 累计 + 连续天数 + 常听歌手）
 *   #qqm听歌榜      本群排行（可加 今日 / 本周 / 总）
 *
 * 数据全部是**本地记账**：记的是本机器人真正发出去的歌（见 utils/stats.js 顶部）。
 * 它不登录、不调用任何平台接口，所以不需要账号，也谈不上碰平台风控。
 *
 * ⚠️ 这个文件**只能导出插件类**：加载器（index.js）把「第一个函数导出」当成插件类去
 *    new，多导出一个辅助函数就会让整个模块失效（命令全部"无人接管"）。所有文案与
 *    计算都在 utils/stats.js —— 那边是 util，随便导出。
 *
 * 规则不会和「#qqm听N」互吃：那条要求"听"字后面**直接跟数字**，本文件的两条都带
 * 听歌/榜/统计字样。优先级 460，避开点歌（400）与其它模块（500+）。
 */
import { loadPluginBase } from '../utils/plugin-base.js';
// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase();
import { getCfg } from '../utils/common.js';
import { logWarn } from '../utils/log.js';
import { statsConfig, statsOf, groupBoard as readBoard, scopeOf, formatPersonalStats, formatBoardText, } from '../utils/stats.js';
// 两条命令的正则放 utils/command.js（规则表与 handler **共用一份**，别在这儿再抄一遍）
import { RE_MY_STATS, RE_STATS_BOARD } from '../utils/command.js';
const RANGE_LABEL = { today: '今日', week: '本周', total: '总榜' };
/** 把命令里的那个词归一成三个口径之一（没写就是总榜） */
function parseRange(text = '') {
    const raw = String(String(text || '').trim().match(RE_STATS_BOARD)?.[1] || '').trim();
    if (/^(今日|今天)$/.test(raw))
        return 'today';
    if (/^本周$/.test(raw))
        return 'week';
    return 'total';
}
export class qqmusicStats extends (await loadPluginBase()) {
    constructor() {
        super({
            name: 'QQ音乐-听歌统计',
            desc: '本群点播时长统计与排行（本地记账）',
            event: 'message',
            priority: 460,
            rule: [
                {
                    // ⚠️ 用 .source 而不是手抄：与 utils/command.js 的解析同源
                    reg: RE_MY_STATS.source,
                    fnc: 'myStats',
                },
                {
                    reg: RE_STATS_BOARD.source,
                    fnc: 'board',
                },
            ],
        });
    }
    cfg() {
        return getCfg();
    }
    /** 关着就直说（静默不响应会让人以为命令写错了） */
    async disabled(e) {
        await e.reply('听歌统计已关闭（主人可在 Karin WebUI →「听歌时长统计」打开）');
        return true;
    }
    /** #qqm听歌：我自己的账 */
    async myStats(e) {
        const c = statsConfig(this.cfg());
        if (!c.enable)
            return await this.disabled(e);
        const scope = scopeOf(e);
        if (!scope) {
            await e.reply('取不到你的账号信息，暂时没法统计');
            return true;
        }
        try {
            const s = statsOf(scope, e.user_id);
            if (!s) {
                await e.reply('还没有你的点播记录：先 #qqm点歌 关键词，再 #qqm听1 播放就有了');
                return true;
            }
            await e.reply(formatPersonalStats(s));
        }
        catch (err) {
            logWarn(`听歌统计查询失败: ${err.message}`);
            await e.reply(`统计查询失败：${err.message}`);
        }
        return true;
    }
    /** #qqm听歌榜 [今日|本周|总]：本群的账 */
    async board(e) {
        const c = statsConfig(this.cfg());
        if (!c.enable)
            return await this.disabled(e);
        if (!e.group_id) {
            await e.reply('群榜要在群里看（#qqm听歌 是你自己的统计）');
            return true;
        }
        const range = parseRange(e.msg);
        try {
            const rows = readBoard(scopeOf(e), range, { limit: 10 });
            if (!rows.length) {
                await e.reply(`本群还没有${RANGE_LABEL[range]}的点播记录`);
                return true;
            }
            await e.reply(formatBoardText(rows, RANGE_LABEL[range]));
        }
        catch (err) {
            logWarn(`听歌榜查询失败: ${err.message}`);
            await e.reply(`排行查询失败：${err.message}`);
        }
        return true;
    }
}
//# sourceMappingURL=stats.js.map