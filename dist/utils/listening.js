/** Platform task client. Tasks live in the API; no bot-side background timer. */
import { createHash, randomUUID } from 'node:crypto';
import { request } from './api.js';
export const RE_LISTENING = /^#?(?:[qQ]{2}[mM]|[qQ]{2}音乐)刷歌[\s\S]*$/;
const PREFIX = /^#?(?:[qQ]{2}[mM]|[qQ]{2}音乐)刷歌/;
const MID = /^[A-Za-z0-9]{10,32}$/;
const TASK_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const PLATFORM = { qq: 'qq', qq音乐: 'qq', 酷狗: 'kugou', kugou: 'kugou', kg: 'kugou' };
const platformOf = name => Object.prototype.hasOwnProperty.call(PLATFORM, String(name).toLowerCase()) ? PLATFORM[String(name).toLowerCase()] : undefined;
const ACTIVE = new Set(['queued', 'running', 'verifying', 'stopping']);
const STATUS = { queued: '排队中', running: '提交中', verifying: '核对平台统计', stopping: '停止中', stopped: '已停止',
    completed: '平台增量已确认', partial: '增量未完全确认', failed: '失败', interrupted: '已中断' };
const REASONS = { 'statistics-not-increasing': '连续查询未看到统计增长，任务已停止提交', 'account-changed': '登录账号已更换',
    'day-changed': '已跨日，今日任务已中断', 'counter-reset': '平台统计低于任务基线', 'counter-regressed': '平台统计低于上次确认值',
    'restart-no-replay': 'API 重启后中断，旧批次不会重放', 'service-shutdown': '服务关闭，任务已中断',
    'acknowledgement-uncertain': '提交结果不确定，旧批次不会自动重试', 'daily-limit': '目标超出今日上限',
    'playback-key-unavailable': '未取得 QQ 官方播放凭证', 'upstream-error': '平台响应或网络异常',
    'upstream-http-error': '平台返回非成功 HTTP 状态', 'invalid-statistics': '平台没有返回有效统计' };
export const LISTENING_TIP = '使用本人登录槽或独立 Token 的绑定账号；共享 Token 不支持时长任务。已接收量与平台统计增量分开显示；后台不播放音频，真实账号入账仍未完成验收。';
export const LISTENING_HELP_SECTION = {
    title: '平台时长任务', tag: '主人', master: true,
    items: [
        { name: 'QQ 时长任务', desc: '分钟数 + 歌名或 songmid，末尾带「确认」', example: '#qqm刷歌 QQ 10 晴天 确认' },
        { name: '酷狗时长任务', desc: '提交新增时长目标，需本人酷狗登录态', example: '#qqm刷歌 酷狗 10 确认' },
        { name: '查看任务', desc: '缺省查看当前任务；可指定 QQ、酷狗或任务ID', example: '#qqm刷歌状态' },
        { name: '任务记录', desc: '当前账号最近五条任务，不自动请求平台统计', example: '#qqm刷歌记录' },
        { name: '核对平台统计', desc: '仅刷新已结束任务的增量，不重发旧批次', example: '#qqm刷歌刷新 QQ' },
        { name: '停止任务', desc: '可指定平台或任务ID；末尾带「确认」', example: '#qqm刷歌停止 QQ 确认' },
        { name: '平台时长', desc: 'QQ 显示今日秒数，酷狗显示累计秒数', example: '#qqm刷歌统计 酷狗' },
        { name: 'QQ 每日 24 小时', desc: '当天持续补到24小时；每轮60分钟并轮换歌手歌曲', example: '#qqm刷歌每天 周杰伦 确认' },
        { name: '酷狗每日 24 小时', desc: '按酷狗累计时长补到当天24小时目标', example: '#qqm刷歌每天 酷狗 确认' },
        { name: '固定轮数', desc: '只执行指定轮次；专辑和歌手每轮轮换下一首', example: '#qqm刷歌每天 专辑 叶惠美 20次 确认' },
        { name: '自定义时间', desc: '可选参数依次为每轮分钟、轮数、每天时间', example: '#qqm刷歌每天 周杰伦 30分 20次 08:30 确认' },
        { name: '继续计划', desc: '继续已保存的计划，无需重填歌手和时间', example: '#qqm刷歌继续 确认' },
        { name: '计划列表', desc: '查看轮次、状态与下次运行时间', example: '#qqm刷歌计划列表' },
        { name: '暂停计划', desc: '暂停 / 继续 / 立即 / 删除；多计划加目标名或ID', example: '#qqm刷歌暂停 确认' },
        { name: '任务帮助', desc: '查看任务用法及状态说明', example: '#qqm刷歌帮助' },
    ],
};
export const LISTENING_USAGE = ['平台时长任务（仅主人）', ...LISTENING_HELP_SECTION.items.map(i => `${i.example}\n${i.desc}`), LISTENING_TIP].join('\n\n');
const bad = message => ({ action: 'invalid', message });
const fault = code => Object.assign(new Error(code), { listeningCode: code });
export function parseListeningCommand(text = '') {
    const raw = String(text || '').trim();
    if (!RE_LISTENING.test(raw))
        return null;
    let tail = raw.replace(PREFIX, '').trim();
    if (!tail || tail === '帮助')
        return { action: 'help' };
    // 短命令只补全默认参数，再交给同一套完整命令校验，不另起一套任务逻辑。
    const daily = /^每天\s+([\s\S]+?)\s+(确认|confirm)$/i.exec(tail);
    if (daily) {
        let content = daily[1].trim(), time = '00:05', minutes = '', rounds = '一直';
        const timeMatch = /\s+(\d{1,2}:\d{2})$/.exec(content);
        if (timeMatch) {
            time = timeMatch[1].padStart(5, '0');
            content = content.slice(0, timeMatch.index).trim();
        }
        const roundsMatch = /\s+(\d+次|一直|每天)$/.exec(content);
        if (roundsMatch) {
            rounds = roundsMatch[1];
            content = content.slice(0, roundsMatch.index).trim();
        }
        const leadingDuration = /^(\d+)(分钟|分|小时|h)\s+/i.exec(content);
        const durationMatch = leadingDuration || /\s+(\d+)(分钟|分|小时|h)$/i.exec(content);
        if (durationMatch) {
            minutes = /小时|h/i.test(durationMatch[2]) ? String(Number(durationMatch[1]) * 60) : durationMatch[1];
            content = (leadingDuration ? content.slice(durationMatch[0].length) : content.slice(0, durationMatch.index)).trim();
        }
        if (/\s+-?[\d.]+(?:分钟|分|小时|h|次)$/i.test(content))
            return bad('时长和轮数必须为正整数，可选参数顺序为：30分 20次 08:30');
        const platformOnly = /^(QQ|酷狗|kg)$/i.exec(content);
        if (platformOnly) {
            const platform = platformOf(platformOnly[1]);
            if (platform !== 'kugou')
                return bad('QQ 每日计划需要歌手、专辑或歌曲名，例如 #qqm刷歌每天 周杰伦 确认');
            minutes ||= '1440';
            return parseListeningCommand('#qqm刷歌计划 酷狗 歌曲 累计时长 ' + minutes + ' ' + rounds + ' ' + time + ' 确认');
        }
        const targetMatch = /^(?:(QQ|酷狗|kg)\s+)?(?:(歌曲|专辑|歌手)\s+)?([\s\S]+)$/i.exec(content);
        if (!targetMatch)
            return bad('请填写歌手、专辑或歌曲名；酷狗可直接发送 #qqm刷歌每天 酷狗 确认');
        minutes ||= '60';
        return parseListeningCommand('#qqm刷歌计划 ' + (targetMatch[1] || 'QQ') + ' ' + (targetMatch[2] || '歌手') + ' ' + targetMatch[3] + ' ' + minutes + ' ' + rounds + ' ' + time + ' 确认');
    }
    if (/^每天/.test(tail))
        return bad('简写：#qqm刷歌每天 周杰伦 确认，或 #qqm刷歌每天 酷狗 确认；每日目标固定为24小时');
    if (tail === '计划')
        return { action: 'plan-list' };
    const shortControl = /^(暂停|继续|删除|立即)(?:\s+([\s\S]+?))?\s+(?:确认|confirm)$/i.exec(tail);
    if (shortControl)
        return { action: 'plan-action', operation: { 暂停: 'pause', 继续: 'resume', 立即: 'run', 删除: 'remove' }[shortControl[1]], selector: (shortControl[2] || '').trim(), confirmed: true };
    if (/^(暂停|继续|删除|立即)/.test(tail))
        return bad('计划操作需在末尾加「确认」，例如 #qqm刷歌暂停 确认；多计划时加歌手名或计划ID');
    if (tail === '计划列表')
        return { action: 'plan-list' };
    const planAction = /^计划(暂停|继续|立即|删除)\s+(\S+)\s+(?:确认|confirm)$/i.exec(tail);
    if (planAction)
        return { action: 'plan-action', operation: { 暂停: 'pause', 继续: 'resume', 立即: 'run', 删除: 'remove' }[planAction[1]], id: planAction[2], confirmed: true };
    const plan = /^计划\s+(?:(QQ|酷狗|kg)\s+)?(歌曲|专辑|歌手)\s+(.+?)\s+(\d+)\s+(一直|每天|(\d+)次)(?:\s+(\d{2}:\d{2}))?\s+(确认|confirm)$/i.exec(tail);
    if (plan) {
        const platform = platformOf(plan[1] || 'QQ') || 'qq';
        const targetType = { 歌曲: 'song', 专辑: 'album', 歌手: 'singer' }[plan[2]];
        const roundSeconds = Number(plan[4]) * 60;
        if (!Number.isSafeInteger(roundSeconds) || roundSeconds < 60 || roundSeconds > 86400)
            return bad('每轮时长应为 1～1440 分钟');
        if (platform === 'kugou' && targetType !== 'song')
            return bad('酷狗只有累计时长统计，目标类型请选择「歌曲」并填写累计时长');
        if (plan[6] && (!Number.isSafeInteger(Number(plan[6])) || Number(plan[6]) < 1 || Number(plan[6]) > 3650))
            return bad('执行轮数应为 1～3650 次');
        const time = plan[7] || '00:05';
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
            return bad('每日时间格式应为 00:00～23:59');
        return { action: 'plan-add', platform, targetType, target: plan[3].trim(), roundSeconds,
            repeat: plan[5] === '一直' || plan[5] === '每天' ? 'continuous' : 'rounds', totalRounds: plan[6] ? Number(plan[6]) : 3650,
            scheduleTime: time, confirmed: true };
    }
    if (/^计划/.test(tail))
        return bad('计划格式：QQ 歌手 周杰伦 60 一直 00:05 确认，或 QQ 专辑 叶惠美 60 20次 00:05 确认');
    const control = /^(状态|记录|刷新|停止|统计)(?:\s+([\s\S]*))?$/.exec(tail);
    if (control) {
        const action = { 状态: 'status', 记录: 'list', 刷新: 'refresh', 停止: 'stop', 统计: 'profile' }[control[1]];
        let rest = (control[2] || '').trim(), confirmed = false;
        if (action === 'stop') {
            confirmed = /(?:^|\s)(?:确认|confirm)$/i.test(rest);
            rest = rest.replace(/(?:^|\s)(?:确认|confirm)$/i, '').trim();
            if (!confirmed)
                return bad('停止任务请在命令末尾加「确认」');
        }
        if (action === 'list' && rest)
            return bad('查看记录请使用 #qqm刷歌记录');
        const platform = platformOf(rest);
        if (action === 'profile')
            return !rest || platform ? { action, platform: platform || 'qq' } : bad('平台只支持 QQ 或酷狗');
        if (rest && !platform && !TASK_ID.test(rest))
            return bad('请填写 QQ、酷狗或完整任务ID');
        return { action, ...(platform ? { platform } : rest ? { id: rest } : {}), ...(action === 'stop' ? { confirmed } : {}) };
    }
    const confirmed = /\s+(?:确认|confirm)$/i.test(tail);
    if (!confirmed)
        return bad('启动任务请在命令末尾加「确认」，例如 #qqm刷歌 QQ 10 晴天 确认');
    tail = tail.replace(/\s+(?:确认|confirm)$/i, '').trim();
    const args = tail.split(/\s+/);
    let platform = platformOf(args[0]);
    if (platform)
        args.shift();
    else
        platform = 'qq';
    const minutesText = args.shift() || '', minutes = Number(minutesText);
    if (!/^\d+$/.test(minutesText) || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440)
        return bad('新增时长应为 1～1440 分钟，平台只支持 QQ 或酷狗');
    const target = args.join(' ').trim();
    if (platform === 'qq' && (!target || target.length > 200))
        return bad('QQ 任务需要歌名或 songmid，例如 #qqm刷歌 QQ 10 晴天 确认');
    if (platform === 'kugou' && target)
        return bad('酷狗任务只需分钟数，例如 #qqm刷歌 酷狗 10 确认');
    return { action: 'start', platform, minutes, target, confirmed: true };
}
function duration(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        return '未取得';
    const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), secs = value % 60;
    return `${hours ? hours + '小时' : ''}${minutes ? minutes + '分' : ''}${secs || !hours && !minutes ? secs + '秒' : ''}`;
}
const label = platform => platform === 'qq' ? 'QQ音乐' : '酷狗音乐';
export function formatListeningJob(job) {
    if (!job || !TASK_ID.test(job.id || ''))
        throw fault('invalid-response');
    const song = job.songTitle ? `歌曲：${job.songTitle}${job.songArtist ? ' - ' + job.songArtist : ''}` :
        job.songmid ? `歌曲ID：${job.songmid}` : job.platform === 'kugou' ? '歌曲：酷狗累计时长（平台不返回歌曲记录）' : '歌曲：正在匹配';
    const lines = [`${label(job.platform)} · ${STATUS[job.status] || '状态待核对'}`, `任务：${job.id}`, song,
        `请求新增：${duration(job.requestedSeconds)}`, `平台已确认接收：${duration(job.submittedSeconds)}`,
        `平台统计增量：${duration(job.confirmedDelta)}`, `统计口径：${job.metric === 'today' ? '今日' : job.metric === 'total' ? '累计' : '尚未查询'}`];
    if (job.inFlightSeconds > 0)
        lines.push(`结果待核对批次：${duration(job.inFlightSeconds)}`);
    if (job.reason)
        lines.push(`说明：${REASONS[job.reason] || '平台响应或任务服务异常，请稍后核对'}`);
    if (job.status === 'partial')
        lines.push('可用 #qqm刷歌刷新 核对延迟计入；不会重发旧批次');
    if (ACTIVE.has(job.status))
        lines.push('查看：#qqm刷歌状态；停止：#qqm刷歌停止 确认');
    lines.push('统计增量可能包含其他客户端的播放，已接收不等于已计入。');
    return lines.join('\n');
}
export function listeningError(error) {
    const code = error?.listeningCode || error?.payload?.code;
    const messages = { 'no-task': '当前账号没有可查询的任务，请先 #qqm刷歌帮助', 'not-owned': '当前账号下没有这条任务',
        'missing-user': '无法取得发送者账号，未执行任务', 'client-busy': '正在处理你的启动请求，请先查看 #qqm刷歌状态',
        'bound-account-mismatch': 'API 返回的账号槽与请求不一致，且未确认独立 Token 绑定关系；请更新 API 后在锅巴 / WebUI 核对 Token',
        'shared-token-readonly': '当前是共享账号 Token，不能执行时长任务；请在 Token 管理器新建独立 Token，使用它扫码登录自己的账号，再填入锅巴 / WebUI',
        'token-scope-changed': 'Token 已停用、删除或更换绑定账号，计划已暂停，请检查 Token 管理器',
        'unsupported-api': 'API 尚未提供时长任务接口，请更新 API 后重试', 'invalid-response': 'API 返回的数据不完整，请更新 API 并核对任务状态',
        'song-not-found': '未找到匹配的 QQ 官方歌曲，请补充歌手名或直接填写 songmid',
        'login-required': '请先绑定发送者自己的 QQ音乐或酷狗账号，再启动任务',
        'account-busy': '该平台账号已有任务，请先查看 #qqm刷歌状态', 'task-service-busy': '时长任务服务正被另一进程占用，请检查 API 是否多开',
        'request-id-conflict': '这条消息已用于其他参数，请重新发送命令', 'not-found': '任务不存在或无权访问',
        'task-store-invalid': '任务记录异常，服务已保留原文件，请检查 API',
        'plan-store-invalid': '刷歌计划记录异常，服务未覆盖原文件', 'target-not-found': '没有找到计划目标，请补充完整歌名、专辑名或歌手名',
        'unsupported-target': '酷狗时长同步不支持专辑或歌手轮换', 'plan-limit': '刷歌计划数量已达上限', 'invalid-plan': '计划参数无效',
        'plan-ambiguous': '有多个匹配计划，请在命令中加歌手名或完整计划ID；#qqm刷歌计划 查看列表', 'no-plan': '没有找到对应计划；#qqm刷歌计划 查看列表', 'master-required': '定时计划需要管理 Token 或绑定自己账号的独立 Token；请更新 API 并在锅巴 / WebUI 检查 Token', 'invalid-target': '请填写歌曲、专辑或歌手名', 'invalid-schedule': '每日执行时间格式错误',
        'invalid-round': '每轮时长必须是整分钟', ...REASONS };
    return Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] :
        (/HTTP 404/.test(error?.message || '') ? 'API 尚未提供时长任务接口，请更新 API 后重试' : '请求未完成，请检查 API 连接并先查看任务状态；不要反复启动同一任务。');
}
export function formatListeningPlan(plan) {
    return `${plan.platform === 'qq' ? 'QQ音乐' : '酷狗'} · ${plan.statusLabel}\n计划：${plan.id}\n${plan.targetType === 'album' ? '专辑' : plan.targetType === 'singer' ? '歌手' : '歌曲'}：${plan.target}\n每轮：${duration(plan.roundSeconds)}\n每天：${plan.scheduleTime} 起补到24小时\n轮次：${plan.roundDisplay || (plan.repeat === 'continuous' ? '持续' : '')}${plan.currentJob ? `\n当前任务：${plan.currentJob}` : ''}${plan.lastError ? `\n说明：${listeningError({ payload: { code: plan.lastError } })}` : ''}`;
}
export function buildListeningStatusCard(job, plans = []) {
    const activePlan = plans.find(p => ['running', 'waiting', 'idle'].includes(p.status)) || plans[0];
    return { title: '平台时长任务',
        subtitle: job ? `${label(job.platform)} · ${STATUS[job.status] || '待核对'}` : (plans.length ? '当前没有执行中的单次任务' : '还没有单次任务或每日计划'),
        status: job ? STATUS[job.status] || '待核对' : activePlan ? activePlan.statusLabel : '空闲',
        song: job?.songTitle || (job?.songmid || '') || (job?.platform === 'kugou' ? '酷狗累计时长（平台不返回歌曲记录）' : '暂无执行歌曲'),
        artist: job?.songArtist || '', platform: job?.platform || activePlan?.platform || 'qq',
        requested: duration(job?.requestedSeconds), submitted: duration(job?.submittedSeconds), confirmed: duration(job?.confirmedDelta),
        planText: plans.slice(0, 4).map(formatListeningPlan).join('\n\n'), tip: LISTENING_TIP };
}
export function createListeningClient({ call = request } = {}) {
    const starting = new Set();
    async function invoke(route, data, method, userKey) {
        const body = await call(route, data, method, userKey, { asUser: true, timeout: 20000, maxRedirects: 0 });
        if (body?.result !== 100)
            throw fault('unsupported-api');
        return body.data;
    }
    async function jobs(userKey) {
        const result = await invoke('/listening/jobs', {}, 'get', userKey);
        if (!Array.isArray(result))
            throw fault('invalid-response');
        return result;
    }
    async function planList(userKey) {
        const result = await invoke('/listening/plans', { all: 0 }, 'get', userKey);
        if (!Array.isArray(result))
            throw fault('invalid-response');
        return result;
    }
    async function personalScope(userKey, { isMaster = false } = {}) {
        // 账号槽是服务端分配的标识，不必等于聊天发送者 ID。
        // 仅主人命令可采用服务端明确确认的独立 Token 绑定槽；主密钥不会自动换人。
        const scope = await invoke('/login/status', {}, 'get', userKey);
        if (typeof scope?.userKey !== 'string' || !scope.userKey || scope.userKey.length > 128)
            throw fault('invalid-response');
        const bound = scope.tokenKind === 'guest' && scope.bound === true;
        if (bound && (scope.tokenShared === true || scope.tokenId !== scope.userKey))
            throw fault('shared-token-readonly');
        if (scope.userKey === userKey)
            return userKey;
        if (isMaster === true && bound && scope.tokenShared !== true && scope.tokenId === scope.userKey)
            return scope.userKey;
        throw fault('bound-account-mismatch');
    }
    async function ownKugou(userKey) {
        const account = await invoke('/kugou/status', {}, 'get', userKey);
        if (account?.loggedIn !== true || account.hasOwn !== true || account.source !== 'user')
            throw fault('login-required');
    }
    async function select(command, userKey) {
        const list = await jobs(userKey);
        if (command.id) {
            const owned = list.find(j => j.id === command.id);
            if (!owned)
                throw fault('not-owned');
            return owned;
        }
        const candidates = list.filter(j => !command.platform || j.platform === command.platform);
        const job = command.action === 'refresh' ? candidates.find(j => !ACTIVE.has(j.status)) || candidates[0] : candidates.find(j => ACTIVE.has(j.status)) || candidates[0];
        if (!job)
            throw fault('no-task');
        return job;
    }
    async function executeScoped(command, { userKey, messageId = '', selfId = '' } = {}) {
        if (!command)
            return '';
        if (command.action === 'help')
            return LISTENING_USAGE;
        if (command.action === 'invalid')
            return command.message;
        if (!userKey)
            throw fault('missing-user');
        if (command.action === 'plan-add') {
            if (command.confirmed !== true)
                throw fault('invalid-response');
            if (command.platform === 'kugou')
                await ownKugou(userKey);
            const plan = await invoke('/listening/plan/add', { ...command, confirm: 1 }, 'post', userKey);
            return `刷歌计划已创建\n${formatListeningPlan(plan)}`;
        }
        if (command.action === 'plan-list') {
            const list = await planList(userKey);
            return list.length ? list.map(formatListeningPlan).join('\n\n') : '当前账号还没有刷歌计划';
        }
        if (command.action === 'plan-action') {
            if (command.confirmed !== true)
                throw fault('invalid-response');
            // 先读取本人计划再消歧；绝不把省略目标解释成批量修改。
            const plans = await planList(userKey);
            const matching = command.id ? plans.filter(p => p.id === command.id) : plans.filter(p => !command.selector || p.id === command.selector || p.target === command.selector);
            if (!matching.length)
                throw fault('no-plan');
            if (matching.length !== 1)
                throw fault('plan-ambiguous');
            const result = await invoke('/listening/plan/action', { id: matching[0].id, action: command.operation, confirm: 1 }, 'post', userKey);
            return result?.removed ? '刷歌计划已删除' : formatListeningPlan(result);
        }
        if (command.action === 'start') {
            if (command.confirmed !== true)
                throw fault('invalid-response');
            if (starting.has(userKey))
                throw fault('client-busy');
            starting.add(userKey);
            try {
                if (command.platform === 'kugou')
                    await ownKugou(userKey);
                let id = '', chosen = '';
                if (command.platform === 'qq') {
                    const direct = command.target.replace(/^mid:/i, '');
                    if (MID.test(direct) && (/^mid:/i.test(command.target) || /^\d/.test(direct)))
                        id = direct;
                    else {
                        const found = await invoke('/search', { key: command.target, t: 0, pageNo: 1, pageSize: 1, fill: 0, local: '0' }, 'get', userKey);
                        const song = found?.list?.find(s => MID.test(String(s.songmid || s.mid || '')) && (!s.source || s.source === 'qq'));
                        if (!song)
                            throw fault('song-not-found');
                        id = song.songmid || song.mid;
                        chosen = `官方匹配：${String(song.songname || song.name || song.title || command.target).slice(0, 120)}\n`;
                        command.title = String(song.songname || song.name || song.title || '').slice(0, 300);
                        command.artist = Array.isArray(song.singer) ? song.singer.map(s => s?.name).filter(Boolean).join(' / ') : String(song.singer || song.artist || '');
                    }
                }
                const requestId = 'bot-listen-' + createHash('sha256').update(JSON.stringify([selfId, userKey, messageId || randomUUID(), command.platform, command.minutes, command.target])).digest('hex');
                const job = await invoke('/listening/start', { platform: command.platform, minutes: command.minutes, ...(id ? { id } : {}),
                    title: command.title || (command.platform === 'qq' ? command.target : ''), artist: command.artist || '', confirm: 1, requestId }, 'post', userKey);
                return chosen + formatListeningJob(job);
            }
            finally {
                starting.delete(userKey);
            }
        }
        if (command.action === 'profile') {
            if (command.platform === 'kugou')
                await ownKugou(userKey);
            const profile = await invoke('/listening/profile', { platform: command.platform }, 'get', userKey);
            if (!['today', 'total'].includes(profile?.metric) || !Number.isSafeInteger(profile.seconds) || profile.seconds < 0)
                throw fault('invalid-response');
            return `${label(command.platform)} · ${profile.metric === 'today' ? '今日' : '累计'}听歌时长：${duration(profile.seconds)}`;
        }
        if (command.action === 'list') {
            const list = await jobs(userKey);
            return list.length ? list.slice(0, 5).map(formatListeningJob).join('\n\n') : '当前账号还没有时长任务';
        }
        if (command.action === 'status') {
            const [list, planned] = await Promise.all([jobs(userKey), planList(userKey)]);
            const selected = command.id ? list.find(j => j.id === command.id) : list.find(j => (!command.platform || j.platform === command.platform) && ACTIVE.has(j.status)) || list.find(j => !command.platform || j.platform === command.platform);
            if (command.id && !selected)
                throw fault('not-owned');
            return { text: selected ? formatListeningJob(selected) : (planned.length ? '当前没有执行中的单次任务' : '当前没有刷歌任务或计划'),
                card: buildListeningStatusCard(selected, planned) };
        }
        const job = await select(command, userKey);
        if (command.action === 'stop') {
            if (command.confirmed !== true)
                throw fault('invalid-response');
            return formatListeningJob(await invoke('/listening/stop', { id: job.id, confirm: 1 }, 'post', userKey));
        }
        if (command.action === 'refresh' && ACTIVE.has(job.status))
            return '任务还在执行，请用 #qqm刷歌状态 查看；结束后再刷新统计';
        return formatListeningJob(await invoke('/listening/job', { id: job.id, ...(command.action === 'refresh' ? { refresh: 1 } : {}) }, 'get', userKey));
    }
    async function execute(command, context = {}) {
        if (!command || ['help', 'invalid'].includes(command.action))
            return executeScoped(command, context);
        if (!context.userKey)
            throw fault('missing-user');
        const accountKey = await personalScope(context.userKey, { isMaster: context.isMaster === true });
        const result = await executeScoped(command, { ...context, userKey: accountKey });
        if (accountKey === context.userKey)
            return result;
        const note = '执行账号：当前独立 API Token 绑定的账号槽（' + accountKey + '）';
        if (typeof result === 'string')
            return note + '\n' + result;
        return { ...result, text: note + '\n' + (result.text || ''),
            ...(result.card ? { card: { ...result.card, subtitle: result.card.subtitle + ' · Token绑定账号' } } : {}) };
    }
    return { execute, jobs, planList, personalScope };
}
//# sourceMappingURL=listening.js.map