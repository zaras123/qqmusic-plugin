/**
 * QQ 音乐「勋章 / 任务进度」查询
 *   #qqm勋章            平台侧的听歌时长 + 勋章任务进度（只读）
 *   #qqm勋章任务        同上（写法随你，正则两条都收）
 *
 * ⚠️ 这是**只读**查询：走 API 的 /cgi 透传两个只读方法，不签到、不领奖、不上报、
 *    不发心跳。想刷时长/自动做任务，那是伪造平台数据，本插件不做 —— 这里只把平台
 *    自己记的真实进度读回来给你看。
 *
 * ⚠️ 这个文件**只能导出插件类**：加载器（index.js）把「第一个函数导出」当成插件类去
 *    new，多导出一个辅助函数就会让整个模块失效。所有解析与文案都在 utils/medal.js。
 *
 * 优先级 458：比听歌统计（460）低一点、比点歌（400）高，规则形状与它们都不重叠。
 */
import { loadPluginBase } from '../utils/plugin-base.js';
// 预加载插件基类（支持 ESM + top-level await）
await loadPluginBase();
import { getCfg, replyCardOrText } from '../utils/common.js';
import { logWarn } from '../utils/log.js';
import { medalConfig, fetchListeningDetail, fetchMedalTasks, fetchPlayPageTaskDetail, formatMedalReport, buildMedalCardData, } from '../utils/medal.js';
// 正则放 utils/command.js（规则表与 handler 共用一份，别在这儿再抄一遍）
import { RE_MEDAL } from '../utils/command.js';
export class qqmusicMedal extends (await loadPluginBase()) {
    constructor() {
        super({
            name: 'QQ音乐-勋章进度',
            desc: '查询平台侧听歌时长与勋章任务进度（只读）',
            event: 'message',
            priority: 458,
            rule: [
                {
                    // ⚠️ 用 .source 而不是手抄：与 utils/command.js 的解析同源
                    reg: RE_MEDAL.source,
                    fnc: 'medal',
                },
            ],
        });
    }
    cfg() {
        return getCfg();
    }
    /** #qqm勋章：平台侧进度（只读） */
    async medal(e) {
        const c = medalConfig(this.cfg());
        if (!c.enable) {
            await e.reply('勋章进度查询已关闭（主人可在 Karin WebUI →「勋章进度（只读）」打开）');
            return true;
        }
        const userKey = String(e.user_id || '');
        const problems = [];
        let listening = {};
        let tasks = {};
        let playpage = {};
        try {
            listening = await fetchListeningDetail(userKey, { timeout: c.timeout });
        }
        catch (err) {
            logWarn(`勋章：听歌时长查询失败 ${err.message}`);
            problems.push(`听歌时长查询失败：${err.message}`);
        }
        if (c.actID) {
            try {
                tasks = await fetchMedalTasks(c.actID, userKey, { timeout: c.timeout });
            }
            catch (err) {
                logWarn(`勋章：任务查询失败 ${err.message}`);
                problems.push(`勋章任务查询失败：${err.message}`);
            }
        }
        else {
            // 没配活动 ID 时用播放页任务兜底（只读）：不需要 actID，也不用主人账号顶替
            try {
                playpage = await fetchPlayPageTaskDetail(userKey, { timeout: c.timeout });
            }
            catch (err) {
                logWarn(`勋章：播放页任务查询失败 ${err.message}`);
                problems.push(`播放页任务查询失败：${err.message}`);
            }
        }
        const report = { listening, tasks, playpage, actID: c.actID, note: problems.join('\n') };
        // 文本回退先算好：卡片渲染失败（或没装 Puppeteer）时直接发它，与图片卡看同一批事实。
        const fullText = formatMedalReport(report);
        // ⚠️ 必须在命令内**动态** import render.js：静态引入会把 Puppeteer 拽进插件启动路径。
        let render;
        try {
            const { renderMedalCard } = await import('../utils/render.js');
            render = renderMedalCard;
        }
        catch {
            /* 没有渲染依赖时，replyCardOrText 会走下面的文本回退 */
        }
        await replyCardOrText(e, {
            render,
            data: buildMedalCardData(report),
            onFallback: () => e.reply(fullText),
            tag: '勋章进度卡片',
        });
        return true;
    }
}
//# sourceMappingURL=medal.js.map