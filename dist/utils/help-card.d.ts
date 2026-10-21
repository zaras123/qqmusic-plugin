/**
 * @param {object} [e] 消息事件；e.isMaster 为真时渲染主人相关条目
 */
export declare function buildHelpCardData(e: any): {
    version: string;
    logo: string;
    statCommands: string;
    statQuality: any;
    statMode: string;
    apiHint: string;
    isMaster: boolean;
    tip: string;
    sections: ({
        title: string;
        tag: string;
        items: {
            name: string;
            desc: string;
            example: string;
        }[];
    } | {
        title: string;
        tag: string;
        items: {
            name: string;
            desc: string;
            example: string;
        }[];
    })[];
};
/**
 * 2.0 帮助卡数据（**只在解锁时用**，见 apps/song.js 的 help）
 *
 * 与老卡的差别：
 *   · 第一段是**动态的多平台清单**（当前开着哪几家、各自的命令与免登录档位）
 *   · 头部统计换成"平台数 / 最高音质 / 运行模式"，让一眼看出 2.0 在跑
 *   · 其余段落直接复用老卡的分组（不重复维护两份文案）
 */
export declare function buildGuideCardData(e: any, { currentSource, full }?: {
    currentSource?: string;
    full?: boolean;
}): {
    version: string;
    logo: string;
    title: string;
    subtitle: string;
    /**
     * 音源清单（「多平台」主题的帮助卡"一行一个平台"用它）
     * ⚠️ 与 `sections[0].platforms` 是同一份数据的两种形状：老主题（classic/apple）
     * 吃的是 sections 里的那个数组，这里单独给一份带 needsCredential/short 的，
     * 免得为了新主题去改老模板的取值路径。
     */
    sources: {
        tag: string;
        tone: string;
        toneColor: string;
        id: string;
        label: string;
        short: string;
        color: string;
        quality: string;
        needsCredential: boolean;
    }[];
    statPlatformsTotal: string;
    platformsText: string;
    currentSource: string;
    /**
     * 是否展开全部条目
     *   false（默认）：每段最多 8 条 —— 51 条全铺开卡片会长到 3400px，
     *                  QQ 里会被压成一条看不清；压缩后约 1800px，手机上还能读。
     *   true（`#qqm帮助 全部`）：完整清单，给需要"查手册"的人。
     */
    full: boolean;
    statCommands: string;
    statQuality: any;
    statPlatforms: string;
    statMode: string;
    apiHint: string;
    isMaster: boolean;
    tip: string;
    sections: {
        title: string;
        tag: string;
        items: {
            name: string;
            desc: string;
            example: string;
        }[];
    }[];
};
/**
 * 账号写操作专用卡片。
 *
 * 复用 2.0 guide 模板（四套主题都已具备），只把第一段从"多平台音源"切换成
 * "账号操作"：模板靠 `kind === 'manage'` 跳过平台彩条与统计栏。
 *
 * 为什么不新增一个 card 名：`qqmusic-guide` 的 data 形状本来就是
 * `sections[] / items[]`，账号操作正好是同一类内容；复用可以少维护 4 份模板。
 */
export declare function buildManageCardData(e?: any): {
    version: string;
    logo: string;
    statPlatformsTotal: string;
    platformsText: string;
    currentSource: string;
    /**
     * 是否展开全部条目
     *   false（默认）：每段最多 8 条 —— 51 条全铺开卡片会长到 3400px，
     *                  QQ 里会被压成一条看不清；压缩后约 1800px，手机上还能读。
     *   true（`#qqm帮助 全部`）：完整清单，给需要"查手册"的人。
     */
    full: boolean;
    statCommands: string;
    statQuality: any;
    statPlatforms: string;
    statMode: string;
    apiHint: string;
    isMaster: boolean;
    kind: string;
    title: string;
    subtitle: string;
    sources: any[];
    sections: {
        title: string;
        tag: string;
        items: {
            name: string;
            desc: string;
            example: string;
        }[];
    }[];
    tip: string;
};
/**
 * 2.0 帮助的纯文本兜底（渲染失败时用）
 *
 * ⚠️ 只在解锁后才会被调用 —— 未解锁走的是老的那段文本，别把两段混起来。
 */
export declare function formatGuideText(e: any): string;
