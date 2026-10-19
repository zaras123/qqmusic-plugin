/**
 * Karin 生命周期入口（package.json.main 的具名导出）。
 * 必须具名、异步 —— Karin 只认这一个约定。
 */
export declare const KARIN_PLUGIN_INIT: () => Promise<void>;
