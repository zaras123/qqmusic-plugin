# 更新日志

这里只记录 AstrBot 分支的版本；Karin 与 Yunzai 的历史不计入。
## v2.1.22

三端内容与版本同步。

- WebUI 的 `localStorage` 回退同步到 Yunzai/Karin，三端 `app.js` 现在内容一致（bridge 仍按框架区分）。
- AstrBot 发行包字体子集与 16 MiB 审核修正纳入本版本：ZIP 13,384,526 字节（12.76 MiB）。
- 版本统一到 2.1.22；AstrBot 26 项测试、发行 ZIP 冒烟、Yunzai WebUI/多适配器测试、Karin `npm test` 均通过。
## v2.1.21

修复 AstrBot/icqq 群列表读取，并对三端统一 WebUI 再做一次一致性回归。

**修复**

- 适配 icqq `get_group_list()` 返回 `{群号: Group}` 以及对象行：本地曲库页现在能显示 icqq 群，不再永远落到“手动填写群号”。
- 群列表解析同时兼容 `{data/groups/list: [...]}` 包装、对象属性缺省与成员数字段异常。

**校验**

- AstrBot 26 项单元测试通过（新增 API 设置保存、icqq 群对象解析用例）。
- Yunzai WebUI/多适配器/票务/统计/勋章/语音等脚本全部通过；Karin `npm test` 通过。
- WebUI 静态文件与 Yunzai/Karin 逐字节一致（仅 AstrBot 的 bridge 与 sandbox localStorage 回退不同）。
- 发行 ZIP 110 项，真实框架加载、帮助分发与热重载通过。

## v2.1.20

与 Yunzai / Karin 对齐到 2.1.20；本分支作为 AstrBot 插件的源码分支，修复同步到 `astrbot_plugin_qqmusic_ref`。

- 本地曲库 WebUI 统一为「曲库检索 / 发送任务 / 说明」，与 Yunzai / Karin 同一套 HTML/CSS/JS 和 logo。
- 补齐 poster / ticket / medal / listening / platform / platforms / guide 主题模板与 shared/ticket 片段。
- 修复歌词卡片 camelCase 传参导致的 `#qqm歌词` 报错。
- 恢复 OneBot 文件发送失败后的 upload_group_file / upload_private_file 降级。
- 修复 sandbox iframe 下访问 localStorage 导致页面初始化中断。
- 打包清单补入 views/library 与 resources/，发行包不再缺 WebUI 和卡片资源。
- AstrBot 发行包字体精简为 GB2312 + Big5 常用字子集，ZIP 降到 12.8MB，满足插件市场 16 MiB 限制。

## v2.1.18

首个 AstrBot 版本，沿用迁移基线版本号。

**本地曲库 WebUI**

- 新增「本地曲库点歌」视图：搜索 API 本地曲库、批量勾选歌曲、按适配器切换群列表、发送到群，并查看每个群的结果。
- 三平台统一管理页：Yunzai / AstrBot / Karin 共用同一套 HTML、CSS 和主逻辑，AstrBot 通过原生 WebUI bridge 接入，仅保留框架差异。
- 统一「API 设置」页，只配置 API 地址和 Token；未配置 Token 时搜索/发送在服务端返回 `TOKEN_REQUIRED`，不会请求 API 本地曲库。
- 群目标支持 `适配器|账号|群号`；只展示当前在线且有群列表的适配器，没有群列表接口的适配器会明确提示。
- 页面只提交曲库 ID 和群号，带 token 的音频地址由服务端按 ID 重新获取，不回传浏览器；发送任务在后台执行。

**播放与卡片**

- 支持多音源点歌、歌词、MV、分享解析、演出票务、订阅、定时点歌、点歌统计、勋章查询和账号操作。
- 卡片复用 Yunzai/Karin 的 HTML 主题（classic / apple / nebula / multi，含深色与时段底色），默认用 Chromium 渲染；缺少 Playwright/浏览器时自动回退 Pillow，不需要 Node.js。
- 发行包内置 `views/library`、`resources/vendor`、CJK 字体和图标，离线环境也能渲染同一套卡片。
- 普通登录只发送 QQ 码；微信和 App 登录指令使用 QQ 音乐 App 扫码通道。

**平台与投递**

- 采用 AstrBot 原生 Python 插件接口，按在线平台枚举群聊，并按适配器能力投递语音、视频和文件；不支持时降级。
- 适配器投递、曲库发送任务、后台重载和发行 ZIP 加载均做了本地冒烟测试；真实账号扫码与跨平台实发仍需按目标平台逐一验收。

**迁移范围**

- QQ 群「一起听」、平台时长上报未迁移。
- 损坏曲库音频可尝试回退官方同曲，不会自动覆盖原文件。
- 更新日志可在 AstrBot 插件管理查看，管理员也可用 `#qqm更新日志` 查看当前安装版本。
- 迁移差异详见 [README](README.md#迁移差异)。
