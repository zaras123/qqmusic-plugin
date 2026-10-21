/** 兼容带 sendApi 的 Karin 适配器。 */
export declare function botSendApi(e: any, action: any, params?: {}): Promise<any>;
/**
 * NTQQ 系协议端（NapCat / Lagrange / LLOneBot）普遍不支持 go-cq 风格的原生 music 卡，
 * 常以 retcode 1200 / sequence=0 直接拒绝。这里做「能力记忆 + 静默降级」：
 *  - 同一适配器累计失败 3 次后，本会话内自动跳过原生卡，避免每次点歌都刷错误日志
 *  - 首次失败打印完整原因，之后静默；交给调用方降级（自定义卡 / 语音 / 文件）
 * @param {boolean} [force] 忽略失败记忆强制尝试一次
 * @param {object} [cardData] 提供真实播放链后，NTQQ 系 OneBot 用 custom 卡渲染（type:qq 需协议端服务端拉歌单，普遍不支持）
 * @returns {Promise<{ok:boolean, reason?:'unsupported'|'disabled'|'failed', error?:Error}>}
 */
export declare function sendNativeMusicCard(e: any, platformType: any, musicId: any, { force, url, audio, title, image, content, singer }?: {
    audio?: string;
    content?: string;
    force?: boolean;
    image?: string;
    singer?: string;
    title?: string;
    url?: string;
}): Promise<{
    ok: boolean;
    reason: string;
} | {
    reason?: undefined;
    ok: boolean;
} | {
    ok: boolean;
    reason: string;
    error: any;
}>;
export declare function sendCustomMusicCard(e: any, { url, audio, title, image, content, singer, musicType }: {
    audio: any;
    content?: string;
    image: any;
    musicType?: string;
    singer?: string;
    title: any;
    url: any;
}): Promise<boolean>;
export declare function prepareVocalFile(filePath: any, { directExt, maxBytes, lowQuality }?: {
    directExt?: Set<string>;
    maxBytes?: number;
}): Promise<any>;
/**
 * 发送语音
 * - ICQQ：本地路径 / Buffer 均可
 * - OneBot WS：本地路径或 base64://
 * - QQBot：record → 适配器转 audio；mp3/flac 可直传（fork 默认 forceSilk=false）
 *           m4a 等会先转 mp3，避免整首走 silk
 */
export declare function sendVocal(e: any, fileOrUrl: any, httpFallback: any): Promise<boolean>;
/**
 * 音频容器魔数嗅探（纯函数，导出给单测）
 *
 * **下载成功 ≠ 拿到的是音频** —— 这是 2026-09-30「ffmpeg 识别不了母带格式 → 发不出语音」
 * 那条反馈的根：
 *   · 高规格档（母带 / 全景声 / Hi-Res）上游常**只给加密文件**（`.mflac` / `.mgg`，QMC2）。
 *     正常链路是 API 的 `/song/file` 下载并**解密**后回明文；但只要有一次走岔
 *     （重试链直接推上游 purl、API 没解开仍回 200、CDN 给了 404 错误体……），
 *     密文就会以 HTTP 200 原样落盘成一个 `.flac`。
 *   · 之后没有任何一步会怀疑它：ffmpeg 拿到密文只会说
 *     `Invalid data found when processing input`，而日志里只有一句 `Command failed: ffmpeg …`
 *     —— 看不出"这份文件根本不该能用"。
 * 这里按魔数认容器：**认不出 = 这份不可用**（当下载失败处理，交给上层刷新播放链 / 换档位）。
 *
 * ⚠️ 认得宽一点没关系（多认一种就少一次误杀），但**绝不能认不出还放行** ——
 * 放行等于让密文一路走到 ffmpeg 和协议端。已知会经过这条路的音频：
 * QQ 的 mp3 / m4a / flac / ape、API 解密出来的 flac / ogg、各外源（含 YouTube 的 webm/opus）。
 *
 * @returns {'flac'|'ogg'|'mp3'|'mp4'|'wav'|'ape'|'webm'|''} 空串 = 认不出
 */
export declare function sniffAudioContainer(buf: any): any;
export declare function downloadAudio(url: any, saveDir: any, filename?: string, timeout?: number, qualityHint?: string): Promise<{
    filePath: string;
    size: number;
    ext: string;
    url: any;
}>;
export declare function getTempDir(): string;
export declare function formatSize(bytes: any): string;
/**
 * 规整曲名/歌手：去掉括号备注、非法路径字符、压缩空白
 * 例：「恋愛サーキュレーション (恋爱循环)（《化物语》…」→「恋愛サーキュレーション」
 */
export declare function cleanTrackText(s?: string, maxLen?: number): string;
/**
 * 群文件展示名（规整）：
 *   歌手-歌名.flac
 * Highway 失败时 asciiOnly → QQMusic_时间.ext
 */
export declare function buildMusicFileName({ singer, title, quality, ext }?: {
    ext?: string;
    quality?: string;
    singer?: string;
    title?: string;
}, { asciiOnly, includeQuality }?: {
    asciiOnly?: boolean;
    includeQuality?: boolean;
}): string;
/** 兼容旧调用：从磁盘路径剥名字（尽量别用，优先 buildMusicFileName） */
export declare function safeUploadFileName(filePathOrName: any, { asciiOnly }?: {
    asciiOnly?: boolean;
}): string;
/**
 * 上传/发送音频文件
 * @param {string} [displayName] 群里显示的文件名；不传则从路径推断
 */
export declare function uploadGroupFile(e: any, filePath: any, displayName: any): Promise<boolean>;
/**
 * 综合发送（点歌 / 卡片解析共用）
 * 流程: (可选文案/音乐卡) → 下载 → 语音 → 群文件
 */
export declare function deliverSong(e: any, song: any, play: any, options?: {}): Promise<{
    ok: boolean;
    reason: string;
    adapter: string;
    downloaded?: undefined;
    path?: undefined;
    size?: undefined;
    error?: undefined;
} | {
    reason?: undefined;
    ok: boolean;
    downloaded: boolean;
    adapter: string;
    path?: undefined;
    size?: undefined;
    error?: undefined;
} | {
    ok: boolean;
    reason: string;
    error: any;
    adapter: string;
    downloaded?: undefined;
    path?: undefined;
    size?: undefined;
} | {
    reason?: undefined;
    ok: boolean;
    downloaded: boolean;
    path: string;
    size: number;
    adapter: string;
    error?: undefined;
}>;
