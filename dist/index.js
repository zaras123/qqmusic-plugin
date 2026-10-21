/**
 * karin-plugin-qqmusic 入口
 * 放到 Karin/plugins/karin-plugin-qqmusic/
 * 宿主：node-karin（>=1.18）
 *
 * Karin 的加载分两条：
 *   1. 扫 `apps/` 目录、找到每个模块导出的插件类，自己 `new` 一份（不走本文件）；
 *   2. 读到 `package.json.main`（= 本文件）里的具名导出 `KARIN_PLUGIN_INIT`，
 *      启动时调一次，用来做宿主相关的初始化（日志 / 临时目录 / 配置 / 调度器）。
 * 所以「护栏」不能只写在本文件 —— 它落在 utils/plugin-base.js 的基类构造里，
 * 两条加载路径都能吃到；本文件只负责把宿主能力接进来。
 */
import { setTempPath } from './utils/path.js';
import { setLogger, logInfo } from './utils/log.js';
import { startScheduler } from './utils/scheduler.js';
import Config from './components/Config.js';
let runtimeReady = false;
/**
 * 宿主初始化：注入 Karin 的 logger / tempPath，生成配置，拉起调度器。
 * 幂等 —— 重复调用（多 bot / 热重载）只跑一次。
 */
async function initRuntime() {
    if (runtimeReady)
        return;
    runtimeReady = true;
    // 注入宿主能力（拿不到就保持启发式结果 / console 日志）
    try {
        const karin = await import('node-karin');
        setLogger(karin.logger);
        setTempPath(karin.tempPath);
    }
    catch {
        /* 离线测试 / 预览：走 utils/path.js 的启发式结果 */
    }
    // 启动即生成/补全 Karin 运行目录 @karinjs/<插件名>/config/*.yaml
    Config.init();
    // 定时调度器（定时点歌触发 + 歌手新歌订阅扫描）：30s 一跳、幂等、防重入
    startScheduler();
}
/**
 * Karin 生命周期入口（package.json.main 的具名导出）。
 * 必须具名、异步 —— Karin 只认这一个约定。
 */
export const KARIN_PLUGIN_INIT = async () => {
    await initRuntime();
};
logInfo('karin-plugin-qqmusic 初始化入口已注册');
//# sourceMappingURL=index.js.map