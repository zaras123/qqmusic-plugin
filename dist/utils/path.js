import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** 插件根目录（真实路径，解开 junction/symlink） */
function real(p) {
    try {
        return fs.realpathSync(p);
    }
    catch {
        return path.resolve(p);
    }
}
const moduleRoot = real(path.join(__dirname, '..'));
export const pluginPath = path.basename(moduleRoot).toLowerCase() === 'dist' ? real(path.join(moduleRoot, '..')) : moduleRoot;
/** 插件文件夹名 */
export const pluginName = path.basename(pluginPath);
/** 插件包名（package.json.name；源码目录名可能不是 karin-plugin-*，不能拿目录名当包名） */
export const pluginPackageName = (() => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf8'));
        return String(pkg?.name || pluginName);
    }
    catch {
        return pluginName;
    }
})();
/**
 * 插件 logo 的绝对 file URL。
 * 卡片有两条渲染路径（直连截图 / Karin 渲染器），绝对路径在两条里都有效。
 */
export const logoUrl = pathToFileURL(path.join(pluginPath, 'resources/img/logo.png')).href;
function safeReadJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
/**
 * Karin（node-karin）根目录
 *
 * 判定：目录里有 `plugins/`，且 `index.mjs`（`import('node-karin/start')`）或
 * `package.json` 里依赖了 `node-karin`。找不到就返回空串 —— 非 Karin 宿主下
 * 这不是错误，只是「没有这个宿主」。
 * 可用 QQMUSIC_KARIN_PATH 显式指定（脱离框架的脚本 / 本地预览）。
 */
function resolveKarinPath() {
    const fromEnv = String(process.env.QQMUSIC_KARIN_PATH || '').trim();
    if (fromEnv && fs.existsSync(fromEnv))
        return real(fromEnv);
    const roots = [
        process.cwd(),
        path.resolve(pluginPath, '..'),
        path.resolve(pluginPath, '..', '..'),
        path.resolve(pluginPath, '..', '..', '..'),
    ];
    for (const cand of roots) {
        const r = real(cand);
        if (!fs.existsSync(path.join(r, 'plugins')))
            continue;
        if (fs.existsSync(path.join(r, 'index.mjs')))
            return r;
        const pkg = safeReadJson(path.join(r, 'package.json'));
        if (pkg && (pkg.dependencies?.['node-karin'] || pkg.devDependencies?.['node-karin'])) {
            return r;
        }
    }
    return '';
}
export const karinPath = resolveKarinPath();
/**
 * Karin 为 git/npm 插件创建的运行期目录。
 *
 * node-karin 的 createPluginDir() 会把插件的 config/data/resources 建在
 * `<Karin>/@karinjs/<包名>/`，而不是 node_modules 里的包目录。用户配置和数据
 * 必须放这里，升级/重装插件时才不会被覆盖，也不会把人引去 .pnpm 深处找文件。
 */
function resolvePluginStatePath() {
    const fromEnv = String(process.env.QQMUSIC_PLUGIN_STATE_PATH || '').trim();
    if (fromEnv)
        return real(fromEnv);
    if (!karinPath)
        return pluginPath;
    if (pluginPackageName.startsWith('@') && pluginPackageName.includes('/')) {
        const [scope, packageName] = pluginPackageName.split('/');
        return path.join(karinPath, '@karinjs', scope, packageName);
    }
    return path.join(karinPath, '@karinjs', pluginPackageName);
}
export const pluginStatePath = resolvePluginStatePath();
/** 用户配置目录：Karin 下是 @karinjs/<插件名>/config，离线脚本仍回落到插件内 config/config */
export const pluginConfigPath = karinPath
    ? path.join(pluginStatePath, 'config')
    : path.join(pluginPath, 'config/config');
/** 运行期数据目录：Karin 下是 @karinjs/<插件名>/data */
export const pluginDataPath = karinPath ? path.join(pluginStatePath, 'data') : path.join(pluginPath, 'data');
function listLegacyPluginRoots() {
    const roots = new Set();
    roots.add(pluginPath);
    roots.add(pluginStatePath);
    if (karinPath) {
        roots.add(path.join(karinPath, 'plugins', pluginPackageName));
        roots.add(path.join(karinPath, 'node_modules', pluginPackageName));
    }
    // pnpm 更新后旧版本还在 .pnpm/<包名>@<版本>/node_modules/<包名>。
    // 升级时只在新目录缺失的情况下扫描，用来迁移用户配置/数据。
    const marker = `${path.sep}.pnpm${path.sep}`;
    const markerIndex = pluginPath.toLowerCase().indexOf(marker.toLowerCase());
    if (markerIndex >= 0) {
        const pnpmRoot = pluginPath.slice(0, markerIndex + marker.length - 1);
        try {
            for (const entry of fs.readdirSync(pnpmRoot, { withFileTypes: true })) {
                if (!entry.isDirectory() || !entry.name.toLowerCase().startsWith(`${pluginPackageName.toLowerCase()}@`))
                    continue;
                roots.add(path.join(pnpmRoot, entry.name, 'node_modules', pluginPackageName));
            }
        }
        catch { }
    }
    return [...roots];
}
function findLegacyPluginFile(relativePath) {
    let best = '';
    let bestTime = -1;
    for (const root of listLegacyPluginRoots()) {
        const file = path.join(root, relativePath);
        try {
            const stat = fs.statSync(file);
            if (!stat.isFile() || stat.mtimeMs <= bestTime)
                continue;
            best = file;
            bestTime = stat.mtimeMs;
        }
        catch { }
    }
    return best;
}
/** 找到插件运行期文件；新约定目录缺失时，从旧包目录迁移一份过去。 */
export function resolvePluginStateFile(kind, name) {
    const dir = kind === 'config' ? pluginConfigPath : pluginDataPath;
    const target = path.join(dir, name);
    if (fs.existsSync(target))
        return target;
    const legacyPaths = kind === 'config'
        ? [path.join('config', name), path.join('config/config', name)]
        : [path.join('data', name)];
    let legacy = '';
    for (const relative of legacyPaths) {
        legacy = findLegacyPluginFile(relative);
        if (legacy)
            break;
    }
    if (!legacy || path.resolve(legacy) === path.resolve(target))
        return target;
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(legacy, target);
    }
    catch { }
    return target;
}
/**
 * 运行期临时目录
 *
 * 优先 QQMUSIC_TEMP_PATH（脚本 / 预览指定）→ Karin 的 `@karinjs/temp`。
 * KARIN_PLUGIN_INIT 拿到 `node-karin` 的 `tempPath` 后会用 setTempPath()
 * 覆盖成框架真正认的那个目录。
 */
function resolveTempPath() {
    const fromEnv = String(process.env.QQMUSIC_TEMP_PATH || '').trim();
    if (fromEnv)
        return real(fromEnv);
    if (karinPath) {
        for (const rel of ['@karinjs/temp', 'temp', 'data/temp']) {
            const p = path.join(karinPath, rel);
            if (fs.existsSync(p))
                return real(p);
        }
        return path.join(karinPath, '@karinjs/temp');
    }
    return path.join(pluginPath, 'temp');
}
/** 运行期临时目录 */
export let tempPath = resolveTempPath();
/** 运行期目录（缓存 / 截图产物 / 下载落盘都挂这里）—— 与 tempPath 同步 */
export let runtimePath = tempPath;
/** 由 KARIN_PLUGIN_INIT 用 node-karin.tempPath 覆盖（拿不到就保持启发式结果） */
export function setTempPath(p) {
    const v = String(p || '').trim();
    if (!v)
        return tempPath;
    tempPath = real(v);
    runtimePath = tempPath;
    return tempPath;
}
//# sourceMappingURL=path.js.map