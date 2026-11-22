# QQ 音乐 · AstrBot

AstrBot 原生 Python 插件，提供多音源点歌、歌词、MV、分享解析、演出票务和本地图卡。插件对接已部署的 `qqmusic-api-enhanced`，**不需要 Node.js、Karin、浏览器或远程渲染服务**，但仍需要能访问音乐 API。

仓库：<https://github.com/zaras123/astrbot_plugin_qqmusic>

纯 Python 重构已完成，功能未与 Karin 版完全对齐。未迁移项见[迁移差异](#迁移差异)。

## 版本记录

见 [更新日志](CHANGELOG.md)。AstrBot 插件管理中可查看完整记录，管理员也可发送 **#qqm更新日志** 查看当前安装版本的更新内容。

## 安装

1. 用 **AstrBot 4.29.4** 和 **Python 3.12+**。将 ZIP 内的 `astrbot_plugin_qqmusic` 目录解压到 AstrBot 的 `data/plugins/`。从 Git 安装时直接使用本仓库默认分支；本仓库只放 AstrBot 插件。
2. 用 **AstrBot 正在使用的 Python 环境**安装插件的 `requirements.txt`，然后在插件管理页加载或重载。
3. 在插件配置填写 `apiBase`（不重定向的最终地址）与 `apiToken`（后端启用鉴权时填写，不要发到群里）。管理员先发 `#qqm测试`，再用 `#qqm点歌 晴天`、`#qqm听1` 验证搜索和投递。
4. 试听与部分音频转换需宿主机安装 FFmpeg 并加入 PATH；普通卡片渲染不需要 FFmpeg。

### 常用配置

| 目标 | 要改什么 |
| --- | --- |
| 开启第三方音源 | 打开 `unlockV2`，并在 `enabledSources` 中加入所需来源，例如 `netease`；具体可用性取决于 API 和账号。 |
| 控制图片卡 | `renderListCard` 控制出图，`imageFormat` 选 PNG/JPEG，`uiTheme` 和 `uiDark` 切换配色与明暗。绘制或图片投递失败时可降级为文本。 |
| 封面和生僻字 | Pillow 默认离线绘图，内置 Noto Sans SC 中文字体子集。`renderCover` 可选用公开 CDN 封面，`renderFontPath` 可指定本机字体。 |
| 控制媒体投递 | `sendVocal`、`uploadFile` 分别控制语音和文件；`sendNativeCard` 只在 OneBot V11 有对应路径。 |

音源偏好、统计、订阅和定时任务存入 AstrBot 的插件 KV；媒体临时文件默认保存在插件数据目录，不写回插件源码目录。

## 本地曲库 WebUI

在 AstrBot 插件详情页打开「本地曲库点歌」视图：搜索 API 本地曲库，勾选歌曲和已连接平台的群聊，即可直接投递原文件。页面只拿曲库 ID 和元数据，带 token 的音频地址由插件后端重新获取；发送任务在后台执行，页面会显示每首歌到每个群的结果。适合一次补发/群发，不依赖群里先发命令。

## 命令

| 功能 | 示例 |
| --- | --- |
| 点歌、播放、选曲 | #qqm点歌 晴天、#qqm听1、#qqm播放 晴天 |
| 歌词、试听、歌词海报 | #qqm歌词1、#qqm试听1、#qqm海报1 |
| 热搜、发现 | #qqm热搜、#qqm排行、#qqm新歌、#qqm推荐、#qqm电台、#qqm日推、#qqm收藏 |
| 歌手/专辑/歌单/评论 | #qqm歌手 周杰伦、#qqm专辑 范特西、#qqm歌单 关键词、#qqm评论 晴天 |
| MV | #qqmMV 搜索 周杰伦、#qqmMV 播放1、#qqmMV 下载1 |
| 多音源 | 配置启用后，#qqm平台、#qqm平台状态、#qqm源 网易、#qqm酷狗播放 晴天 |
| 分享解析 | QQ 音乐链接和分享卡；Spotify / Apple Music 分享由 API 匹配可播放歌曲 |
| QQ 音乐登录 | 管理员私聊 `#qqm登录` 获取 QQ 码；`#qqm登录微信`、`#qqm登录qq`、`#qqm登录app` 走 QQ 音乐 App 通道；`#qqm状态` 查看状态 |
| 平台凭据 | #qqm登录帮助；第三方扫码或凭据仅私聊；不要在群里发送凭据 |
| 账号操作 | #qqm账号操作；写操作需要管理员私聊，并以「确认」结尾 |
| 演出/票务 | #qqm演唱会、#qqm演出 城市=北京、#qqm演出详情1、#qqm演出下一页 |
| 订阅/定时 | 群管理员 #qqm订阅 歌手、#qqm定时 20:00 晴天；#qqm订阅列表、#qqm定时列表 |
| 统计/勋章 | #qqm听歌、#qqm听歌榜 本周、#qqm听歌状态、#qqm勋章 |
| 设置/更新 | `#qqm设置`、`#qqm界面 深色`；管理员可用 `#qqm更新日志` 查看当前版本，更新和重载在 AstrBot 插件管理执行 |

点歌按 AstrBot 实例、会话、用户隔离，个人最近列表优先，无个人列表时退回本会话最新列表。点击播放或收到文件不代表用户实际听完；插件本地统计只记录成功走过音频投递路径的曲目时长。票务按用户会话单独存储，历史演出仅覆盖 API 已归档记录。

## 适配器

覆盖 AstrBot 4.29.4 的 18 个内置适配器及第三方 iCQQ。旧版插件列出的 8 个适配器（OneBot V11、QQ 官方、Telegram、钉钉、飞书、KOOK、Discord、个人微信）均在覆盖范围内。

下表描述本插件根据 [AstrBot 4.29.4 平台适配器源码](https://github.com/AstrBotDevs/AstrBot/tree/v4.29.4/astrbot/core/platform/sources) 选择的投递路径，不代表对应媒体已经在真实账号上发出。账号权限、文件大小、公网文件服务及被动回复配额仍由平台限制。

| 适配器 | 文本与图片外的媒体路线 |
| --- | --- |
| OneBot V11 (aiocqhttp) | 语音、视频、文件；仅在该适配器走原生 QQ 音乐卡 |
| QQ 官方 / QQ 官方 Webhook | 语音、视频、文件，合并回复并优先首个成功媒体 |
| Telegram、Discord、飞书、钉钉、KOOK、Mattermost、Misskey、Satori、WebChat | 按适配器发送语音、视频、文件 |
| 企业微信 / 企业微信智能机器人 | 框架有语音、视频、文件组件；主动推送能力由实例提供 |
| 个人微信 | 视频、文件；跳过语音 |
| 微信公众号 | 语音；文件/视频回退来源页面 |
| LINE | 语音和视频需要可公开访问的 AstrBot 文件服务；公网文件服务未配置时不能保证媒体投递 |
| Slack | 语音、文件；不直发 Video，MV 可转文件 |
| 第三方 iCQQ | 标准语音、视频、文件；具体由安装的适配器处理 |
| 其他第三方适配器 | 标准文本和图片；不假定支持媒体，回退来源链接 |

不把内网 API、鉴权 Token 或带签名参数的音频 URL 作为文本发到群。原生卡/媒体能否播放、扫码能否成功、定时消息能否主动发送，以实际平台、账号和 API 版本为准。

## 迁移差异

| Karin 功能 | AstrBot 当前行为 |
| --- | --- |
| QQ 群「一起听」 | **未迁移**。AstrBot 公共适配器不提供房间控制接口。 |
| 平台听歌时长上报任务 | **未迁移**。仅保留本地投递统计、官方时长与勋章只读查询。 |
| 损坏曲库文件修复 | 本地音频下载或格式校验失败时，符合条件的 QQ 曲目会尝试改用官方音源；**不会自动覆盖**后端曲库文件。 |
| 主题与 WebUI | 用 Pillow 重绘卡片，设置采用 AstrBot 原生配置 Schema；不复刻 Karin 的主题细节、背景或 WebUI 控件。 |

- 从 Karin 或旧 Python 移植升级：账号槽按 AstrBot 适配器实例和用户隔离，原账号槽不会被误当成当前登录；需要本人重新登录或显式配置公共播放账号。
- Python 基线来自 [wbndm 的 AstrBot 移植](https://github.com/wbndmqaq/astrbot_plugin_qqmusic)，保留其 [MIT 声明](astrbot_assets/LICENSE-WBNDM)。

## 验证与发布

已在 Python 3.12.13、AstrBot 4.29.4 上通过本地回归。安装包解压后验证了真实框架加载、重载、帮助图片和后台更新日志。适配器测试使用模拟事件验证消息组件和降级，**未逐平台验收真实账号扫码和语音、视频、文件实发**。

发版时，在 [CHANGELOG.md](CHANGELOG.md) 增加 `## vX.Y.Z` 版本标题和简要变更，并同步 [metadata.yaml](metadata.yaml) 的版本号与功能描述。运行 `python scripts/package_astrbot.py` 校验后生成安装包。
