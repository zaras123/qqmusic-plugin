export declare function getCfg(): any;
/** 点歌/登录/管理等指令，解析模块应放行 */
export declare function isPluginCommandMsg(msg?: string): boolean;
/**
 * 优先渲染图片卡；失败则 formatText / 自定义 onFallback
 * @returns {Promise<boolean>} 是否已成功回复（图或文）
 */
export declare function replyCardOrText(e: any, { render, data, formatText, onFallback, tag }: {
    data: any;
    formatText: any;
    onFallback: any;
    render: any;
    tag?: string;
}): Promise<boolean>;
/**
 * 列表卡（歌手 / 专辑 / 歌单 / 排行 / 新歌 / 点歌结果）的统一出口
 *
 * 收在这里的原因：这段「动态 import 卡片数据 + 渲染 → replyCardOrText → 文本兜底」
 * 原本在 6 个命令里各抄了一遍，差量只有标题、卡片选项和兜底文案。
 *
 * ⚠️ 卡片模块必须**动态 import**：utils/card-data.js 与 utils/render.js 会把
 *    art-template / Puppeteer 一并拉起来，不能在插件启动时就加载。
 * ⚠️ 热搜卡（buildHotCardData/renderHotCard）与评论卡（buildCommentCardData/
 *    renderCommentCard）虽然同样挂在 `renderListCard !== false` 闸门后面，
 *    但用的**不是**列表卡 —— 别顺手收进来。
 *
 * @param {object} e 消息事件
 * @param {{title: string, list: Array, options?: object, formatText?: Function, tag?: string}} args
 *   title 同时用作卡片标题与默认文本标题；options 透传给 buildListCardData
 * @returns {Promise<boolean>} 是否已回复（图或文）
 */
export declare function replyListCardOrText(e: any, { title, list, options, formatText, tag }?: {
    options?: {};
    tag?: string;
}): Promise<boolean>;
