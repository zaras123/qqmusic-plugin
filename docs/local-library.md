# 本地曲库兼容

点歌、解析和下载共用 API 的本地优先机制：命中本地直接返回；未命中由 API 继续原官方登录链路。第三方采集接口只在 API / Token 管理器配置，无需在插件内逐个增加。

- 搜索保留本地标记、曲库 ID、现场/原版标签，在线补歌平台开关不再过滤本地文件。
- 列表显示“本地”以及文件实际音质，B站 192k/M4A 不会显示为 FLAC。
- 下载保留实际格式并校验文件容器；B站条目不会发送为 QQ 原生歌曲 ID 卡片。
- 下载失败刷新链接时保留账号槽位。本地及第三方地址不再改写为 QQ CDN。

B站长标题的歌手、歌名和版本识别由最新 API 完成。识别不确定的条目应在 Token 管理器校正标签，不能保证任意视频标题都自动准确识别。

更新时将对应框架包中的文件覆盖到插件目录；Karin 包包含预编译 dist。保留原有 config/config 和 data，更新后重启对应机器人。API 端也应更新到支持 B站曲库标签的版本。

回归测试（需要 ffmpeg）：

```sh
# Karin 先 npm run build；Yunzai 直接运行
node scripts/test-library-compat.mjs
# 可选：指向 API 源码，用真实路由与隔离临时曲库验证
QQMUSIC_TEST_API_ROOT=/path/to/qqmusic-api-enhanced node scripts/test-library-compat.mjs
```

测试生成音频并使用模拟发送回调，不连接真实 QQ 账号，不读取线上 Token 或 Cookie。
