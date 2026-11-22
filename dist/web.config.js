import { defineConfig } from 'node-karin';
import { CONSOLE_URL, registerQqmusicConsole } from './utils/console-server.js';
const PLUGIN_ID = 'karin-plugin-qqmusic';
registerQqmusicConsole();
export default defineConfig({
    info: {
        id: PLUGIN_ID,
        name: 'QQ音乐插件',
        author: { name: 'local', home: '' },
        icon: { color: '#31c27c' },
        description: 'QQ 音乐点歌 / 本地曲库投递 / 卡片解析 / 扫码登录',
    },
    page: {
        url: CONSOLE_URL,
        title: 'QQ音乐管理',
        description: '本地曲库检索、按适配器选择群并投递原文件；音频地址只在服务端使用。',
    },
});
//# sourceMappingURL=web.config.js.map