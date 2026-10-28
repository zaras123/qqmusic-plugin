/**
 * QQ 音乐点歌
 * 命令统一 #qqm 前缀，避免与其它插件 #点歌/#播放 冲突:
 *   #qqm点歌 / #qqm 点歌 关键词
 *   #qqm听1 ~ #qqm听N（兼容：本插件会话内仍可用 #听N）
 *   #qqm播放 关键词
 *   #qqm歌词 关键词或songmid
 *   #qqm热搜
 */
declare const qqmusicSong_base: any;
export declare class qqmusicSong extends qqmusicSong_base {
    constructor();
    cfg(): any;
    /**
     * 「#qqm点歌 / #qqm播放（含平台前缀）」的**唯一入口**
     *
     * 一条规则 → 一个入口 → 按解析出的动词分流到 pickSong / playDirect。
     * 这样"两条规则抢同一条消息"这类冲突从结构上就不存在了（实测抓过：
     * `#qqm网易云播放 晴天` 会被点歌规则的"动词可省"分支抢走）。
     */
    onSongCmd(e: any): Promise<boolean>;
    /** 无前缀「#点歌」：配置开启才接管，否则放行给其它点歌插件 */
    pickSongDefault(e: any): Promise<boolean>;
    pickSong(e: any): Promise<boolean>;
    /**
     * 2.0：**跨平台点歌**（QQ 关掉 / 搜不到 / QQ 侧报错时用它顶列表）
     *
     * 走 API 的 `?sources=`（多平台并行搜 + 去重 + 逐条验证可播 + 按平台交错），
     * 列表、会话、`#qqm听N` 与 QQ 点歌完全共用 —— 用户操作没有区别。
     */
    pickAcrossPlatforms(e: any, { keyword, cfg, userKey, reason, qqError }: {
        cfg: any;
        keyword: any;
        qqError?: string;
        reason?: string;
        userKey: any;
    }): Promise<boolean>;
    /**
     * 2.0：`#qqm网易云点歌 关键词` 等单平台点歌（由 pickSong 分流进来）
     *
     * 也保留"直接调用"的入口（单测用它验闸门）：`pickSongPlatform(e)` 会自己从消息里
     * 再解析一次平台与关键词。
     */
    pickSongPlatform(e: any): Promise<boolean>;
    /** 单平台点歌的实体（pickSong 与 pickSongPlatform 共用，保证两条入口行为一致） */
    pickSongOnPlatform(e: any, platName: any, keyword: any, { viaSource }?: {
        viaSource?: boolean;
    }): Promise<boolean>;
    /**
     * 2.0：`#qqm平台状态` —— 各家平台**登录状态卡**（未解锁时不响应）
     *
     * 只打**一次** API（`GET /platforms` 聚合），卡片上"下一步该干什么"直接写出来：
     * 能扫码的给 `#qqm<平台>登录`，凭据类的给 POST 接口，匿名音源标"不需要账号"。
     */
    platformsStatusCard(e: any): Promise<boolean>;
    /**
     * 2.0：`#qqm<平台>状态` —— **单平台**状态卡（#qqm网易状态 / #qqm酷狗状态 …）
     *
     * 数据与聚合卡同源（`GET /platforms`，10s 缓存），这里只挑出那一家，
     * 再把它的命令清单补齐：这一家怎么点歌/播放/取词、缺什么、下一步点哪。
     * 未解锁（？？？关着）时**静默放行**：这些命令在 1.9 里不存在。
     */
    platformStatusCard(e: any): Promise<boolean>;
    /** 2.0：`#qqm平台` —— 列出当前可用的音源平台（未解锁时不响应） */
    platformList(e: any): Promise<boolean>;
    /**
     * 2.0：`#qqm源` 查看 / `#qqm源 网易` 切换当前音源
     *
     * 存在的理由：平台名 + "点歌" 每次都打太啰嗦（`#qqmApple Music点歌` 长达 13 个字符）。
     * 设一次就够 —— 之后 `#qqm点歌 关键词` 直接走它，想切回 QQ 用 `#qqm源 默认`。
     *
     * **作用域按身份分**（见 ownPrefScopeOf 的注释）：
     *   · 主人设的是全群默认；成员设的只对自己生效 —— 谁都别想改别人
     *
     * 未解锁时**不响应**（这条命令在 1.9 里不存在）。
     */
    sourceCmd(e: any): Promise<boolean>;
    /**
     * 点歌列表的统一收尾：MV 徽标 → 写会话 → 图片卡 / 纯文本
     *
     * 抽出来是因为 2.0 的单平台点歌要走**同一条**收尾（列表卡、会话、回退文案
     * 三件事必须一致，否则「#qqm听1」在两个入口下的行为会不一样）。
     */
    presentList(e: any, { keyword, list, cfg, title, sourceLabel }: {
        cfg: any;
        keyword: any;
        list: any;
        sourceLabel?: string;
        title: any;
    }): Promise<boolean>;
    chooseSong(e: any): Promise<boolean>;
    playDirect(e: any): Promise<boolean>;
    /**
     * 2.0：`#qqm<平台>播放 关键词` —— 只在那家搜第一条再播
     *
     * 与 QQ 的 `#qqm播放` 走**同一条播放链**（playOne），差别只在"去哪搜"和来源标注，
     * 这样两个入口的播放行为、降级提示、失败文案不会各走各的。
     */
    playDirectOnPlatform(e: any, platName: any, keyword: any, { viaSource }?: {
        viaSource?: boolean;
    }): Promise<boolean>;
    /**
     * 「搜到一首 → 取链 → 详情卡 → 发送」这条链（`#qqm播放` 与各平台播放共用）
     *
     * 抽出来的原因很实在：以前这段只在 playDirect 里，2.0 再加一个平台播放入口
     * 就得复制一遍 —— 那种复制一改就分叉（一处改了降级提示、另一处还是旧的）。
     */
    playOne(e: any, { song, cfg, userKey }: {
        cfg: any;
        song: any;
        userKey: any;
    }): Promise<boolean>;
    getLyric(e: any): Promise<boolean>;
    hotSearch(e: any): Promise<boolean>;
    categoryHelp(e: any): Promise<boolean>;
    help(e: any): Promise<boolean>;
}
export {};
