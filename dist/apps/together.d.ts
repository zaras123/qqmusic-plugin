declare const qqmusicTogether_base: any;
export declare class qqmusicTogether extends qqmusicTogether_base {
    constructor();
    cfg(): any;
    /** #qqm一起听 N：取会话列表第 N 首塞进一起听 */
    togetherPick(e: any): Promise<boolean>;
    /** #qqm一起听 状态：只读；总开关关着就不到 API 去问 */
    togetherState(e: any): Promise<boolean>;
    /**
     * #qqm一起听 探测        只读：扫 aio_type 候选（需要群里已有房间才有对照）
     * #qqm一起听 探测 写入   主动开房：对每个候选真的 create_room 再回读状态，不需要群里先有房间
     *
     * 主人专属，且故意**不**受总开关约束 —— 开关关着时它正是排查手段
     * （API 侧同理：探测不受熔断限制）
     */
    togetherProbe(e: any): Promise<boolean>;
}
export {};
