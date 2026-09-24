<p align="center">
  <img src="resources/img/logo.png" width="120" alt="logo">
</p>

<h1 align="center">qqmusic-plugin</h1>

<p align="center">
  <strong>Yunzai-Bot / TRSS-Yunzai QQ 音乐插件</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="node">
  <img src="https://img.shields.io/badge/Yunzai-v3-blue" alt="yunzai">
  <img src="https://img.shields.io/badge/TRSS-Multi--Protocol-purple" alt="trss">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="license">
  <img src="https://img.shields.io/github/stars/zaras123/qqmusic-plugin?style=flat&logo=github" alt="stars">
  <a href="https://github.com/zaras123/qqmusic-plugin">
    <img src="https://count.getloli.com/get/@zaras123.qqmusic-plugin?theme=rule34" alt="visitors">
  </a>
</p>

---

## ⚠️ 免责声明

**本项目仅供技术学习与交流使用。**

- 本项目不提供任何音源服务，API 由用户自行解决
- 使用者应遵守所在地区法律法规及相关平台用户协议
- 本项目不鼓励、不支持任何商业用途或侵犯版权的行为
- 因使用本项目产生的一切后果由使用者自行承担
- 本项目作者不保证项目的持续可用性，不提供任何明示或暗示的担保
- 如有权利人认为本项目存在侵权，请通过 Issue 联系，我们将及时处理

**本项目代码仅供学习 Node.js 插件开发、Bot 协议对接、音视频流处理等技术，不代表作者赞同其中涉及的任何第三方服务的使用方式。**

---

## 🤖 AI 辅助开发声明

**本插件部分代码由 AI 辅助完成，请勿将其作为生产环境或商业项目的基础直接使用。**

- AI 生成的代码可能存在隐蔽的逻辑缺陷或安全漏洞
- 使用者应自行审查代码，确保理解其行为后再部署
- 不建议在未经授权的情况下将本项目用于大规模自动化服务
- 如发现问题请通过 Issue 反馈，欢迎贡献修复

---

## 📮 用户群

QQ 群：[点击加入](https://qm.qq.com/q/GKxEVvF8Ua)

- API 地址和 Token 申请
- 使用问题反馈
- 更新通知

---

## 功能一览

| 分类 | 功能 | 说明 |
|------|------|------|
| 🎵 点歌 | `#qqm点歌 关键词` | 搜索列表（带 🎬 MV 徽标），`#qqm听N` 选曲播放（名单按人隔离，千人群互不串号） |
| 🎵 点歌 | `#qqm播放 关键词` | 直接播放第一条 |
| 🎵 点歌 | 其它平台补充曲 | QQ 音乐没版权的歌自动补几条网易云/酷我的**免费曲**（128k）到列表尾部，带来源图标；锅巴可关 |
| 🎵 点歌 | 主人账号回落 | 「一律走主人账号」默认开：所有人点歌都按主人的 ck（自动取最近扫码登录的账号，无需手填）——全群都能播 VIP 曲；锅巴可关 |
| 🎵 点歌 | `#qqm歌词 关键词` | 歌词查询（补充曲走对应平台的歌词接口） |
| 🎵 点歌 | `#qqm热搜` | 热搜榜 |
| 🎵 点歌 | `#qqm帮助` | 帮助图片卡片 |
| 🎧 发现 | `#qqm排行 榜单名` | 排行榜（飙升/热歌/新歌等） |
| 🎧 发现 | `#qqm推荐` | 热门推荐歌单 |
| 🎧 发现 | `#qqm来首歌` | 随机推荐一首并播放 |
| 🎧 发现 | `#qqm电台` | 个性电台 5 首 |
| 🎧 发现 | `#qqm日推` | 每日推荐（需登录） |
| 🎧 发现 | `#qqm收藏` | 我的收藏（需登录） |
| 🎧 发现 | `#qqm新歌` | 新歌速递，`#qqm新歌 序号` 选地区（1内地/2欧美/3日本/4韩国/5最新/6港台） |
| 🎧 发现 | `#qqm歌手 关键词` | 搜索歌手，展示热门歌曲 |
| 🎧 发现 | `#qqm专辑 关键词` | 搜索专辑，展示曲目列表 |
| 🎧 发现 | `#qqm歌单 关键词` | 搜索歌单，展示歌曲 |
| 🎧 发现 | `#qqm评论 关键词` | 查看歌曲热门评论（独立评论卡片） |
| 🎬 MV | `#qqmMV` | MV 分类浏览 |
| 🎬 MV | `#qqmMV 搜索 关键词` | 搜索 MV 列表 |
| 🎬 MV | `#qqmMV 播放/下载 序号` | 播放 / 下载列表 MV（点歌后直接发该曲 `#qqmMV 播放/下载` 即可操作） |
| 🔗 解析 | 群内发 QQ 音乐分享 / 链接 | 自动识别并下载播放（免费音乐未登录也可解析，但仍需 api 鉴权 token） |
| 🔗 解析 | 专辑 / 歌单 / 歌手链接 | 自动识别并展示歌曲列表 |
| 🎶 一起听 | `#qqm一起听 N` | 把列表第 N 首加进**群里的一起听**；房间里没有歌时自动开房（ICQQ / NapCat / SnowLuma，需先探测） |
| 🎶 一起听 | `#qqm一起听 状态` | 查看本群房间当前曲目 / 人数 / 是否允许成员点歌（只读） |
| 🎶 一起听 | `#qqm一起听 探测` | 只读探测一起听参数（主人；实际由 API 侧算包，插件只转发） |
| 🔐 登录 | `#qqm登录` | 扫码登录（主人，一张 QQ 码，QQ / QQ 音乐 App 通用） |
| 🔐 登录 | `#qqm登录微信` | 用微信扫一扫登录（走 PC 客户端流程，无需 QQ音乐 App；主人） |
| 🔐 登录 | `#qqm登录qq` | QQ 音乐 App 扫码备用（主人，MQTT 通道） |
| 🔐 登录 | `#qqm绑定 qqmusic://...` | DeepLink 导入（主人） |
| 🔐 登录 | `#qqm状态` / `#qms` | 登录状态卡片 |
| 🔐 登录 | `#qqm同步` | 从 API 同步登录态（主人） |
| 🔐 登录 | `#qqm登出` | 清除登录态（主人） |
| 🔐 登录 | `#qqm刷新` | 续期 key（主人） |
| 🔐 凭据 | `#qqm<平台>ck <cookie>` | 粘贴 cookie 配账号（**只许私聊**）；网易云 / 酷狗 / 汽水 / 酷我 |
| 🔐 凭据 | `#qqmamck <整份 cookies 文件>` | Apple Music 凭据（**只许私聊**，粘 Netscape cookies 文件全文） |
| 🔐 凭据 | `#qqm<平台>清ck` | 清掉自己那份凭据（私聊） |
| ⚙️ 配置 | `#qqm设置` | 查看当前配置 |
| ⚙️ 配置 | `#qqm api <地址>` | 设置 API 地址（主人） |
| ⚙️ 配置 | `#qqm 音质 flac` | 设置最高音质（主人） |
| ⚙️ 配置 | `#qqm 开启/关闭 点歌/解析` | 功能开关（主人） |
| ⚙️ 配置 | `#qqm 测试` | 测试 API 连通（主人） |
| ⚙️ 配置 | `#qqm账号` | 查看已登录账号（主人） |
| 🎨 界面 | `#qqm界面` | 查看/切换卡片主题、深浅色、自定义背景、热重载模板（主人） |
| 🔄 更新 | `#qqm更新` | 拉取最新插件代码（主人，需 git 安装） |
| 🔄 更新 | `#qqm强制更新` | 丢弃本地改动并同步远程（主人） |
| 🔄 更新 | `#qqm更新日志` | 查看最近提交（主人） |

### 音质选项

`128` / `m4a` / `320` / `flac` / `ape` / `hires` / `atmos` / `master` / `atmos_master`

默认 `auto`：自动匹配歌曲最高可用音质，支持逐级降级。

> 📌 **关于「主人账号」**：默认每个群友点歌都用自己的登录态（`userKey` = 各自 QQ 号），没登录就是免登录状态、只能播免费曲。
> 「一律走主人账号」**默认开启**：主人账号**自动取最近一次扫码登录的账号**（无需手填），所有人点歌都按它取播放链 ——
> 全群都能播 VIP 曲，群友在共用同一 API 的自己机器人上登录过非 VIP 号也不影响。
> 机器人还没扫码登录过时开关等于没开（日志会提示一次）；`#qqm设置` 会显示当前生效的账号，标红说明该账号未登录。
>
> 只影响「播歌 / 取数据」；登录状态、取 CK、刷新这些仍只认请求者本人（否则会把别人的登录态误报成本人的）。访客 Token 也无法指定主人账号。
>
> 多账号想固定用某一个时，才在 `config/config/qqmusic.yaml` 里手动填 `publicAccount`（留空=自动）。
> 不需要全员共用主人号时，在锅巴关闭「一律走主人账号」即可。

> 📌 **关于其它平台凭据**：QQ 音乐之外的平台各有**独立**通道（哪家能配、怎么配，以帮助卡的音源行为准）：
> - **能扫码的**（`#qqm<平台>登录`）：QQ 音乐 App · 网易云 · 酷狗 · 汽水。
> - **只能粘贴 cookie 的**（`#qqm<平台>ck`）：**酷我**（没有扫码通道）；网易云 / 酷狗 / 汽水（扫码被风控掐时的备用路）。
> - **Apple Music** 是特例：`#qqmamck` 收的是一份 **Netscape cookies 文件全文**（必须含 `music.apple.com` 那几行）。
> - **免登录的**（B站 / 咪咕 / Audius / JioSaavn）不用配；**YouTube** 卡的是出网代理（`YOUTUBE_PROXY`），配 cookie 没用。
>
> 粘贴 cookie 的命令**必须私聊**：凭据按人存（写进发命令那个人的槽位），群里发等于把账号借给全群 —— 机器人会直接拒收。
> 自己配的这份想全站共用 → 开「一律走主人账号」（锅巴 ① 基础设置）；`#qqm<平台>清ck` 只清自己那份，共享的与别人的都不动。
> 也可以在**锅巴 → 平台**里逐平台粘贴，与私聊发命令等效。

> 📌 **关于高音质（FLAC 以上）**：`hires` / `atmos` / `master` / `atmos_master` 是 **QQ 音乐绿钻会员限定**，且部分歌曲未上架这些音质。若显式设置了高音质却被降级，点歌卡片会直接标明原因（如「API 未返回链接（通常需绿钻会员）」，即账号非会员；「该歌曲未提供此音质」，即歌曲本身没出该档）。日志中 `音质选定: flac ... [hires:no-url, flac:ok]` 也可定位。

---

## 安装

### 1. 安装插件

```bash
cd Yunzai/plugins
git clone https://github.com/zaras123/qqmusic-plugin.git
cd qqmusic-plugin && pnpm install
```

### 2. 配置 API

本插件需要配合后端 API 使用。API 因特殊原因不开源，请加入用户群申请 API 地址和 Token。

在锅巴配置中填写：
- **API 地址**：入群后申请获取
- **API Token**：入群后申请获取

或机器人发送：`#qqm api <地址>`

### 3. 启动

重启 Yunzai，日志出现 `qqmusic-plugin 已加载` 即成功。

首次启动（或删除 `config/config/qqmusic.yaml` 后重启）会自动从 `config/default_config/` 生成用户配置文件。

主人发送 `#qqm登录` 扫码即可开始使用。

### 3.5 卡片字体（**Linux 容器必看**）

卡片上的中文优先用**宿主机装的字体**渲染。**2026-09-24 起插件自带一份 CJK 兜底字体**
（Noto Sans SC 子集，GBK 全集 21791 字，woff2 共约 13.7MB，SIL OFL 1.1 可随包分发）——
所以"容器里一个中文字体都没有"**不会再变成方块**：系统里没有中文字体时才会下载这份兜底字体。

不过它只是**兜底**：想要 2.0 主题设计稿那套观感（MiSans / PingFang），还是建议在宿主机装字体。

先看日志：每个进程第一次出卡时会打一行

```
[qqmusic-plugin] 卡片字体：命中 MiSans（本机可用：…）
```

* 命中 `MiSans` / `PingFang SC` / `HarmonyOS Sans SC` → 用的就是设计的那套，没问题；
* 命中别家（如 `Noto Sans SC`、`Microsoft YaHei`）→ 能用，但观感与设计稿有差；
* 打出 **警告**「字体栈里一个都没装」→ 就是这一节要解决的情况。

装字体（装完重启机器人即可，**不用**改任何配置）：

```bash
# Debian / Ubuntu 容器
apt-get update && apt-get install -y fonts-noto-cjk fonts-wqy-microhei fonts-noto-color-emoji
# RHEL / CentOS / Rocky
dnf install -y google-noto-sans-cjk-fonts google-noto-emoji-color-fonts
```

**emoji 也要装**：卡片上的 `🔒 会员` / `✅ 有播放链接` / `🔗 链接解析` 这类符号靠 **emoji 字体**渲染，
没装就是空方框（"图标形容不出来"）。上面两条命令里的 `fonts-noto-color-emoji` /
`google-noto-emoji-color-fonts` 就是它。顺带说明：**卡片模板本身已经不再依赖 emoji**
（MV 标记改成了文字小标 "MV"），剩下这几处是数据层拼进去的符号；聊天里那批发给别处的
emoji（帮助文本等）由 QQ 客户端渲染，跟宿主字体无关。

> 想更贴近设计稿可以装 **MiSans**（小米开源，可商用）：把 `MiSans-Regular/Demibold` 丢进
> `/usr/share/fonts/` 后 `fc-cache -fv`。**注意**：只装 Regular 一个字重时，卡片上的粗体
> 只能由浏览器"撑"出来，小字号中文会出现笔画糊连（这正是"字体残缺"最常见的成因）——
> 所以至少要装 Regular + 一个粗体。

### 4. 更新插件

需通过 `git clone` 安装（目录内有 `.git`）。主人发送：

```text
#qqm更新        # 快进拉取（本地有改动时会提示）
#qqm强制更新    # reset 到远程，丢弃插件内未提交修改（保留 config/config）
#qqm更新日志    # 最近提交记录
```

也可使用 Yunzai 自带：`#更新qqmusic-plugin`。

更新成功后请 `#重启` 使新代码生效。若 `package.json` 有变更，插件会尝试自动 `pnpm/npm install`。

> 📌 **关于 API**：后端 API 涉及平台接口对接等技术细节，出于安全和合规考虑不对外开源。如需使用请加入用户群申请。

---

## 适配器支持

| 能力 | ICQQ | OneBot WS | QQBot 官方 |
|------|:----:|:---------:|:----------:|
| 文本 / 图片 | ✅ | ✅ | ✅ |
| 语音 | ✅ | ✅ | ✅ |
| 视频（MV） | ✅ 本地下载后发 | ✅ 直链 / 本地 | ✅ 直链 |
| 群文件 | ✅ | ✅ | ✅ |
| 原生音乐卡 | 视协议 | 视协议 | — |
| 一起听（群听歌） | ✅ | ✅ NapCat / SnowLuma（待实测） | — |

> 📌 **关于原生音乐卡**：NTQQ 系协议端（NapCat / Lagrange / LLOneBot 等）不支持 go-cq 风格的 `type:qq` 音乐卡（该类型需协议端服务端拉歌单，会以 `retcode 1200` 拒绝）。插件在 OneBot 上**直接用 custom 卡**（带真实播放链 + 封面 + 歌手，效果与官方客户端分享一致，参考小飞插件做法）；ICQQ 仍走原生 `type:qq`。同一适配器连续失败 3 次后本会话内自动跳过并静默降级为语音 / 群文件（点歌功能不受影响）。彻底关闭可在锅巴中关掉「发送原生 QQ 音乐卡」。
>
> 📌 **关于高音质语音**：FLAC 等高音质文件体积大，直接作为语音（record）发送会被协议端以体积/格式限制拒绝。插件发送语音前会自动用 ffmpeg 压成紧凑 mp3（保证能发出去），**群文件仍保留原始高音质文件**。需系统安装 `ffmpeg`（`ffmpeg -version` 可验证）。
>
> 📌 **关于群文件上传（OneBot/NTQQ）**：LLOneBot / NapCat / Lagrange 的 `upload_group_file` **动作**对 `.flac` 常报「未知文件类型或路径不存在」。插件 OneBot 上传优先用适配器原生 **`e.group.sendFile`**（与 rconsole-plugin 一致，能正常传无损 flac），失败才依次落到 `upload_group_file` → `send_group_msg` 文件段 → 压缩 mp3 兜底。ICQQ 走 `fs.upload`/`sendFile`。

> 📌 **关于一起听（群听歌）**：走 QQ 的 SSO 命令族 `QQAIOMediaSvc.*`（`share_trans` 入列 / `create_room` 开房），**不是**发一张 `com.tencent.together` 卡片 —— 那种卡只是「开始一起听」的邀请入口，客户端解析它时并不读卡片里的 token，复读或伪造它既开不出房间也排不进歌。
>
> **架构：协议知识全在 API 侧，插件只做「协议端识别 + 发送」。** 插件把群号/协议端/歌曲交给 API；API 算出「下一步该发什么包」并给出承载通道（`icqq` → `sendUni`，`onebot` → `send_packet`）；插件用自己的协议端会话把包发出去，再把响应原样交回 API，由 API 判定成败并给文案。插件里**不解析包、不做业务判断、没有字段定义**，所以它单独分出去也复刻不了这个功能。
>
> 支持的协议端：**ICQQ**，以及带 `send_packet` 扩展动作的 **OneBot**（NapCat、SnowLuma）；LLOneBot / Lagrange 没有该动作，会在首次调用后明确提示并停用。`#qqm一起听 状态` 可随时查看房间当前曲目。
>
> **首次启用要探测一次**（房间参数 aio_type/media_type 是逆向出来的，必须实测）：
> - `#qqm一起听 探测` —— **只读**，扫三个候选值。需要一个"对照"：群里得先有一起听房间（手机开一个）才分辨得出哪个对；
> - `#qqm一起听 探测 写入` —— **主动开房**：拿候选值依次真的 `create_room`、再回读状态看房间有没有建起来，**不需要群里先有房间**。命中后**自动把参数写进 API 的 `data/together.json`**，不用手填；命中即停（不会连开一堆房间）。
>
> 注意：写入模式会在群里留下真实房间（可能残留空房间，需要手动结束），**请在测试群跑**。
>
> **默认关闭**：锅巴「启用一起听」`togetherEnable` 关着时指令不走 API（`#qqm一起听 探测` 除外，它是排障路径）；「点歌后自动同步」`togetherAuto` 是第二个开关，**要与总开关同时打开**才生效。
>
> 首次使用还要在真实群里探测一次：`POST /together/start {"action":"probe"}`（只读），把结果的 `aio_type`/`media_type` 写进 API 的 `data/together.json`（`aioType` 为 0 时同样拒绝写入）。探测不受开关限制。

> 📌 **关于卡片界面（多套 UI）**：所有图片卡片都由 `resources/themes/<主题>/` 下的模板渲染，**丢一个目录进来就是一套新 UI**（详见 [resources/themes/README.md](resources/themes/README.md)）。内置四套：`classic`（原始界面，1.x 默认）、`apple`（排印对齐 apple.com.cn 的实测值：近白底 + 白玻璃卡 + 蓝色小标），以及 **2.0 专版**的 `nebula`「星云 · 鎏光」（暖象牙底 + 液态玻璃 + 香槟金烫字，2.0 的默认主题）与 `multi`「多平台」（冷中性底 + 单一主光，来源色标走色轨/色点/同色玻璃标，一眼看出这首歌来自哪家）。四套都支持深色与时段配色。主人发 `#qqm界面` 查看与切换，深浅色支持「浅色 / 深色 / 跟随时间（夜晚自动深色）」，锅巴里都有。
>
> **换主题、改模板、改 `theme.json` 都是热更新** —— 不用重启机器人（渲染前比对文件 mtime，变了就让 art-template 重新编译；它默认按文件名永久缓存，这正是以前改模板必须重启的原因）。批量改动后想强制重来：`#qqm界面 重载`。
>
> 📌 **自定义背景（apple / nebula / multi 三套支持，classic 忽略）**：`#qqm界面 背景 <路径或链接>`（锅巴里也能设）。三种来源**自动识别**：服务器本地路径（`D:\图片\a.jpg` / `/root/pics/a.jpg`）、图片直链、图片 API（返回 JSON 里有图片地址，或直接返回图片）。开启后卡片材质自动切成 **iOS 液态玻璃**（半透明 + 强模糊 + 边缘高光）；2.0 的星云/多平台本来就是玻璃材质，背景图直接当"玻璃后面的那张墙纸"。
> 远端图**由插件侧取回并缓存成本地文件**（不让浏览器去拉）—— 否则每次渲染都要等远端图，慢图/挂掉的图会把整张卡拖死；缓存时长锅巴可调（`0` = 每次渲染都换）。取不到图时**自动回落主题自带底色**，不影响发卡（日志里有原因）。
>
> 主题可以只实现部分卡片，缺的自动回落到 `classic`（**内置的四套必须实现全** —— 缺一张就会出现"内容是这套主题的、皮肤是经典绿"的拼接感，`test.mjs` 会拦）。本地预览（不进机器人）：`node scripts/preview-cards.mjs`，产出 `temp/preview/<主题>[-dark]/<卡>.png`，走的与生产同一条渲染路径。

---

## 项目结构

```
qqmusic-plugin/
├── index.js                 # 入口（加载 apps、生成配置）
├── apps/
│   ├── song.js              # 点歌 / 播放 / 歌词 / 热搜 / 帮助
│   ├── chart.js             # 排行、推荐、电台、日推、收藏、新歌、MV
│   ├── explore.js           # 歌手、专辑、歌单、评论
│   ├── resolve.js           # 分享/链接解析
│   ├── login.js             # 扫码登录（webqr / MQTT / DeepLink）
│   ├── together.js          # 一起听（把点歌结果加进群里的房间）
│   └── admin.js             # 配置管理 / 更新
├── components/Config.js     # 配置读写
├── utils/
│   ├── api.js               # API 客户端
│   ├── send.js              # 消息发送（语音 / 群文件 / 音乐卡 / MV 视频）
│   ├── render.js            # 图片卡片渲染（按主题解析模板 + 热更新）
│   ├── theme.js             # 主题发现/解析/缓存失效（多套 UI）
│   ├── background.js        # 自定义背景：本地路径/直链/图片 API + 本地缓存
│   ├── card-data.js         # 卡片数据构建
│   ├── adapter.js           # 适配器识别（ICQQ / OneBot / QQBot）
│   ├── together.js          # 一起听：协议端识别 + 发包（协议知识在 API 侧）
│   ├── session.js           # 点歌会话
│   ├── format.js            # 列表文本格式化
│   ├── quality.js           # 音质定义
│   ├── platforms.js         # 平台注册表（名称/别名/品牌色/档位 + **凭据通道**，全项目唯一事实来源）
│   ├── status-card.js       # 登录状态卡片
│   ├── help-card.js         # 帮助卡片
│   ├── update.js            # 插件更新
│   ├── privacy.js           # API 地址脱敏
│   ├── common.js            # 通用工具
│   └── path.js / log.js / plugin-base.js
├── guoba/                   # 锅巴网页配置支持
├── config/
│   ├── default_config/      # 默认配置
│   └── config/              # 运行时配置
└── resources/               # 图片资源 + themes/（各套卡片 UI 的模板）
```

---

## 锅巴配置

安装 [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) 后可在网页配置：

> 配置项按**三大组**折叠（① 基础设置 / ② 界面与外观 / ③ 发送与下载，写法与 R 插件的
> `SOFT_GROUP_BEGIN` 一致）：字段与键名一个都没变，只是不用在一页里翻半天了。

- API 地址 / Token
- 插件、点歌、解析、扫码登录命令开关
- 点歌结果图片卡片开关（关闭回退纯文本）
- 最高音质 / 自动降级
- 语音 / 群文件 / 音乐卡 / 文本信息发送开关
- 禁用高清语音（PC QQ 播放不了高清语音时开启，语音改发 mono16k 低音质）
- 点歌列表数量 / 下载超时 / 文件保留时间
- 接管无前缀「#点歌」（默认关；开启后不加 `#qqm` 前缀的点歌也由本插件处理）
- 其它平台补充曲（默认开；QQ 音乐没有的免费曲从网易云/酷我补进来，128k）
- 音源平台：一家一个页签，各自独立的开关 / 点歌条数 / **凭据段**（能扫码的给扫码命令说明，能粘贴的给 cookie 输入框 —— 凭据只上传到 API，不写进插件配置）
- 一律走主人账号（默认开；主人账号自动取最近扫码登录的账号，所有人点歌都按主人的 ck，锅巴可关）
- 主人账号手动指定（`publicAccount`，留空=自动；多账号想固定用某一个时才填）
- 从 API 一键回填登录态
- 一起听：启用开关（默认关）/ 点歌后自动同步（默认关，需总开关同时打开）—— 协议参数在 API 侧：`data/together.json` 的 `aioType`/`mediaType`/`shareAppid`/`cutSong`/`autoCreate`
- 界面：卡片主题（`resources/themes/` 下的目录名，内置 classic / apple / nebula / multi；2.0 打开后走 `uiThemeV2`，默认 nebula）、深浅色（浅色 / 深色 / 跟随时间）、底色跟随时段、自定义背景（开关 + 来源 + 缓存分钟数，仅 apple 主题支持）

---

## 致谢

- [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) — 多协议 Bot 框架，本插件运行基础
- [Miao-Yunzai](https://gitee.com/yoimiya-kokomi/Miao-Yunzai) — 优秀的 Yunzai 分支，插件兼容参考
- [rconsole-plugin](https://gitee.com/kyrzy0416/rconsole-plugin) — 点歌交互与卡片解析的设计参考

---

## ⚡ 性能红线（改代码前先看）

卡片是高频操作，而插件与所有别的插件共用**同一条事件循环** —— 下面几条都是踩过之后写下来的：

**① 判定必须每次现读配置，别缓存在模块顶层。**
`#qqm界面`、「？？？」开关这类判定（`utils/v2.js`）每次都拿 `Config.getConfig()` 现算。老代码把开关读一次写进模块变量，锅巴里改完要重启才生效，而且「未开启」那个分支还会被缓存成永久的。

**② `Config.getConfig()` 的结果按文件指纹（mtime + size）缓存，返回浅拷贝。**
一次调用要读 + 解析**两份** yaml（实测 ~4.2ms，而且是同步的），一条命令里会被叫好几次，所以必须有缓存；但缓存的是**文件内容**、不是判定结果 —— 锅巴保存 / 手改 yaml / 插件更新覆盖 `default_config`，指纹一变下一次就立刻读到新的（`setConfig` 另有一次主动失效）。返回值是浅拷贝，调用方随便改自己那份不会污染缓存；**将来若要改配置里的嵌套对象，得先把这里改成深拷贝**。

**③ 卡片模块只能动态 import。**
`utils/card-data.js` / `utils/render.js` 会把 art-template 和 Puppeteer 一起拉起来，不能在插件启动时加载（列表卡的统一出口 `replyListCardOrText()` 就负责这件事）。

**④ 渲染共用同一个 Chromium，且别把 `waitUntil` 改回 `networkidle0`。**
以前每张卡都 launch + close 一次 Chrome（实测 launch 545~1368ms、close 232~256ms），而截图本身才 ~600ms —— 一半时间白烧。现在 `utils/render.js` 是**单例浏览器**（空闲 5 分钟自动关、进程退出时 kill），每张卡只开 / 关一个 page。
`waitUntil` 必须留在 `'load'`：内置 44 张模板**一个 `<script>` 都没有**，也没有远程字体；`networkidle0` 在 `file://` 上要等满 500ms 静默窗口（实测 goto 975ms → 65ms），后面仍然显式等 `document.fonts.ready` + 200ms，不会丢字。

**⑤ 列表卡别各写各的。**
排行 / 新歌 / 歌手 / 专辑 / 歌单 / 点歌的「动态 import + 渲染 → 文本兜底」统一走 `utils/common.js` 的 `replyListCardOrText()`；热搜卡与评论卡**不是**列表卡，别顺手收进去。

实测收益：同一张状态卡（`multi` 主题）热态渲染 **3322ms → 1654ms**（约 -50%）；`Config.getConfig()` 命中缓存 **4.22ms → 0.107ms**（约 39×）。`test.mjs` 的「2.0 重构收口」段把这些不变量钉成了断言。

---

## License

[MIT](LICENSE)
