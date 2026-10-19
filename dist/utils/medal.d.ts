export declare const MEDAL_MODULE_LISTENING = "music.listening.ListeningSvr";
export declare const MEDAL_METHOD_LISTENING = "QueryListeningDetail";
export declare const MEDAL_MODULE_TASKS = "music.activeCenter.ActTaskNewSvr";
export declare const MEDAL_METHOD_TASKS = "GetTaskList";
export declare const MEDAL_MODULE_PLAYPAGE = "music.activeCenter.PlaypagetaskSvr";
export declare const MEDAL_METHOD_PLAYPAGE = "GetTaskDetail";
export declare const DEFAULT_MEDAL_TIMEOUT_MS = 15000;
/** 把插件配置归一成勋章模块认识的形状（默认开；活动 ID 缺省为空） */
export declare function medalConfig(cfg?: {}): {
    enable: boolean;
    actID: string;
    timeout: number;
};
/**
 * `/cgi` 代理把上游的 `req_0` 放在 `body.data`（见 API 的 module/cgi.js）。
 * 拿不到就当空对象，交给下面的文案层去说「平台没返回字段」。
 */
export declare function cgiPayload(body: any): any;
/** 上游业务码 → 人话；认不出就给通用文案，绝不把裸 code 当成功 */
export declare function describeMedalCode(code: any, retMsg?: string): string;
/** 取听歌时长明细（只读） */
export declare function fetchListeningDetail(userKey?: string, { timeout }?: {
    timeout?: number;
}): Promise<any>;
/** 取勋章活动任务列表（只读）；没配活动 ID 时不打上游，直接给"缺 ID" */
export declare function fetchMedalTasks(actID: any, userKey?: string, { timeout }?: {
    timeout?: number;
}): Promise<any>;
/**
 * 取播放页任务明细（只读，兜底）
 *
 * 没配活动 ID 时的替代源：不需要 actID，直接问平台「当前播放页有哪些任务」。
 * 仍然是**只读** GET —— 不签到、不领奖、不上报。登录态下形状未知，所以调用方
 * 只在真拿到 data 时才展示（见 formatMedalReport / hasTaskData）。
 */
export declare function fetchPlayPageTaskDetail(userKey?: string, { timeout }?: {
    timeout?: number;
}): Promise<any>;
/**
 * 把响应里**没认出来的标量**铺平列出（对象往下走一层，数组只报长度）
 *
 * 这是"字段名未知"阶段的兜底：与其什么都不显示，不如把平台真返回的字段摆出来。
 */
export declare function flattenScalars(value: any, { maxDepth, max }?: {
    max?: number;
    maxDepth?: number;
}): any[];
/**
 * 从响应里找出任务数组
 *
 * 播放页 `GetTaskDetail` 的真实形状（2026-10-18 实测）是 `data.actTaskInfo` **单对象**，
 * 字段还大写开头（Name/Progress/TargetNum/State/Desc/Detail）—— 只认 taskList/tasks
 * 数组就会把它当成"没有任务列表"，白白丢掉平台已经给回来的那条任务。
 */
export declare function collectTaskList(data?: {}): any[];
/** 听歌时长那一段（返回多行文本数组） */
export declare function formatListeningSection(payload?: {}): any[];
/**
 * 单条任务的结构化数据
 *
 * 文本卡与图片卡共用这一份解析：字段名仍然同时认小写 camelCase 和播放页真实的大写字段，
 * 这样以后平台再换一组名字，只需要补这里，不会出现「文本正常、卡片空白」。
 */
export declare function taskItemOf(task?: {}, index?: number): {
    index: number;
    name: string;
    progressText: string;
    done: boolean;
    buttonText: string;
    rewardText: string;
    percent: number;
};
/** 单条任务的人话写法（小写 camelCase 与平台真实的大写字段都认） */
export declare function taskLineOf(task?: {}, index?: number): string;
/** 勋章任务那一段（返回多行文本数组） */
export declare function formatTaskSection(payload?: {}): string[];
/**
 * 整条回执
 * @param {{listening?:object, tasks?:object, playpage?:object, actID?:string, note?:string}} input
 */
export declare function formatMedalReport({ listening, tasks, playpage, actID, note }?: {
    actID?: string;
    listening?: {};
    note?: string;
    playpage?: {};
    tasks?: {};
}): string;
/** 上游有没有**真返回任务数据**（有非空 data 对象）；只有错误码不算 */
export declare function hasTaskData(payload?: {}): boolean;
/**
 * 图片卡数据
 *
 * 与 formatMedalReport 共用同一组解析函数，保证文本回退与图片卡看到的是同一批事实。
 * 只暴露展示需要的字段，模板不直接接触上游响应，避免把不稳定字段名带进四套主题。
 */
export declare function buildMedalCardData({ listening, tasks, playpage, actID, note }?: {
    actID?: string;
    listening?: {};
    note?: string;
    playpage?: {};
    tasks?: {};
}): {
    title: string;
    subtitle: string;
    readOnlyText: string;
    listen: {
        statusText: string;
        tone: string;
        lines: string[];
    };
    tasks: {
        configured: boolean;
        title: string;
        hint: string;
        note: string;
        items: {
            index: number;
            name: string;
            progressText: string;
            done: boolean;
            buttonText: string;
            rewardText: string;
            percent: number;
        }[];
    };
    playpage: {
        show: boolean;
        title: string;
        note: string;
        items: {
            index: number;
            name: string;
            progressText: string;
            done: boolean;
            buttonText: string;
            rewardText: string;
            percent: number;
        }[];
    };
    note: string;
    footer: string;
};
declare const _default: {
    medalConfig: typeof medalConfig;
    cgiPayload: typeof cgiPayload;
    describeMedalCode: typeof describeMedalCode;
    fetchListeningDetail: typeof fetchListeningDetail;
    fetchMedalTasks: typeof fetchMedalTasks;
    fetchPlayPageTaskDetail: typeof fetchPlayPageTaskDetail;
    flattenScalars: typeof flattenScalars;
    collectTaskList: typeof collectTaskList;
    formatListeningSection: typeof formatListeningSection;
    formatTaskSection: typeof formatTaskSection;
    taskItemOf: typeof taskItemOf;
    taskLineOf: typeof taskLineOf;
    formatMedalReport: typeof formatMedalReport;
    hasTaskData: typeof hasTaskData;
    buildMedalCardData: typeof buildMedalCardData;
};
export default _default;
