export declare const pluginPath: string;
/** 插件文件夹名 */
export declare const pluginName: string;
/**
 * 插件 logo 的绝对 file URL。
 * 卡片有两条渲染路径（直连截图 / Karin 渲染器），绝对路径在两条里都有效。
 */
export declare const logoUrl: string;
export declare const karinPath: string;
/** 运行期临时目录 */
export declare let tempPath: string;
/** 运行期目录（缓存 / 截图产物 / 下载落盘都挂这里）—— 与 tempPath 同步 */
export declare let runtimePath: string;
/** 由 KARIN_PLUGIN_INIT 用 node-karin.tempPath 覆盖（拿不到就保持启发式结果） */
export declare function setTempPath(p: any): string;
