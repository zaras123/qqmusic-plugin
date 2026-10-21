export declare const pluginPath: string;
/** 插件文件夹名 */
export declare const pluginName: string;
/** 插件包名（package.json.name；源码目录名可能不是 karin-plugin-*，不能拿目录名当包名） */
export declare const pluginPackageName: string;
/**
 * 插件 logo 的绝对 file URL。
 * 卡片有两条渲染路径（直连截图 / Karin 渲染器），绝对路径在两条里都有效。
 */
export declare const logoUrl: string;
export declare const karinPath: string;
export declare const pluginStatePath: string;
/** 用户配置目录：Karin 下是 @karinjs/<插件名>/config，离线脚本仍回落到插件内 config/config */
export declare const pluginConfigPath: string;
/** 运行期数据目录：Karin 下是 @karinjs/<插件名>/data */
export declare const pluginDataPath: string;
/** 找到插件运行期文件；新约定目录缺失时，从旧包目录迁移一份过去。 */
export declare function resolvePluginStateFile(kind: any, name: any): string;
/** 运行期临时目录 */
export declare let tempPath: string;
/** 运行期目录（缓存 / 截图产物 / 下载落盘都挂这里）—— 与 tempPath 同步 */
export declare let runtimePath: string;
/** 由 KARIN_PLUGIN_INIT 用 node-karin.tempPath 覆盖（拿不到就保持启发式结果） */
export declare function setTempPath(p: any): string;
