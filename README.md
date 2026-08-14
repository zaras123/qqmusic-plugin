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
| 🎵 点歌 | `#qqm点歌 关键词` | 搜索列表（带 🎬 MV 徽标），`#qqm听N` 选曲播放 |
| 🎵 点歌 | `#qqm播放 关键词` | 直接播放第一条 |
| 🎵 点歌 | `#qqm歌词 关键词` | 歌词查询 |
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
| 🔐 登录 | `#qqm登录` | 扫码登录（主人，一张 QQ 码，QQ / QQ 音乐 App 通用） |
| 🔐 登录 | `#qqm登录微信` | 微信扫码登录（主人） |
| 🔐 登录 | `#qqm登录qq` | QQ 音乐 App 扫码备用（主人，MQTT 通道） |
| 🔐 登录 | `#qqm绑定 qqmusic://...` | DeepLink 导入（主人） |
| 🔐 登录 | `#qqm状态` / `#qms` | 登录状态卡片 |
| 🔐 登录 | `#qqm同步` | 从 API 同步登录态（主人） |
| 🔐 登录 | `#qqm登出` | 清除登录态（主人） |
| 🔐 登录 | `#qqm刷新` | 续期 key（主人） |
| ⚙️ 配置 | `#qqm设置` | 查看当前配置 |
| ⚙️ 配置 | `#qqm api <地址>` | 设置 API 地址（主人） |
| ⚙️ 配置 | `#qqm 音质 flac` | 设置最高音质（主人） |
| ⚙️ 配置 | `#qqm 开启/关闭 点歌/解析` | 功能开关（主人） |
| ⚙️ 配置 | `#qqm 测试` | 测试 API 连通（主人） |
| ⚙️ 配置 | `#qqm账号` | 查看已登录账号（主人） |
| 🔄 更新 | `#qqm更新` | 拉取最新插件代码（主人，需 git 安装） |
| 🔄 更新 | `#qqm强制更新` | 丢弃本地改动并同步远程（主人） |
| 🔄 更新 | `#qqm更新日志` | 查看最近提交（主人） |

### 音质选项

`128` / `m4a` / `320` / `flac` / `ape` / `hires` / `atmos` / `master` / `atmos_master`

默认 `auto`：自动匹配歌曲最高可用音质，支持逐级降级。

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

> 📌 **关于原生音乐卡**：NTQQ 系协议端（NapCat / Lagrange / LLOneBot 等）不支持 go-cq 风格的 `type:qq` 音乐卡（该类型需协议端服务端拉歌单，会以 `retcode 1200` 拒绝）。插件在 OneBot 上**直接用 custom 卡**（带真实播放链 + 封面 + 歌手，效果与官方客户端分享一致，参考小飞插件做法）；ICQQ 仍走原生 `type:qq`。同一适配器连续失败 3 次后本会话内自动跳过并静默降级为语音 / 群文件（点歌功能不受影响）。彻底关闭可在锅巴中关掉「发送原生 QQ 音乐卡」。
>
> 📌 **关于高音质语音**：FLAC 等高音质文件体积大，直接作为语音（record）发送会被协议端以体积/格式限制拒绝。插件发送语音前会自动用 ffmpeg 压成紧凑 mp3（保证能发出去），**群文件仍保留原始高音质文件**。需系统安装 `ffmpeg`（`ffmpeg -version` 可验证）。
>
> 📌 **关于群文件上传（OneBot/NTQQ）**：LLOneBot / NapCat / Lagrange 的 `upload_group_file` **动作**对 `.flac` 常报「未知文件类型或路径不存在」。插件 OneBot 上传优先用适配器原生 **`e.group.sendFile`**（与 rconsole-plugin 一致，能正常传无损 flac），失败才依次落到 `upload_group_file` → `send_group_msg` 文件段 → 压缩 mp3 兜底。ICQQ 走 `fs.upload`/`sendFile`。

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
│   └── admin.js             # 配置管理 / 更新
├── components/Config.js     # 配置读写
├── utils/
│   ├── api.js               # API 客户端
│   ├── send.js              # 消息发送（语音 / 群文件 / 音乐卡 / MV 视频）
│   ├── render.js            # 图片卡片渲染
│   ├── card-data.js         # 卡片数据构建
│   ├── adapter.js           # 适配器识别（ICQQ / OneBot / QQBot）
│   ├── session.js           # 点歌会话
│   ├── format.js            # 列表文本格式化
│   ├── quality.js           # 音质定义
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
└── resources/               # 渲染模板与资源
```

---

## 锅巴配置

安装 [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) 后可在网页配置：

- API 地址 / Token
- 插件、点歌、解析、扫码登录命令开关
- 点歌结果图片卡片开关（关闭回退纯文本）
- 最高音质 / 自动降级
- 语音 / 群文件 / 音乐卡 / 文本信息发送开关
- 禁用高清语音（PC QQ 播放不了高清语音时开启，语音改发 mono16k 低音质）
- 点歌列表数量 / 下载超时 / 文件保留时间
- 从 API 一键回填登录态

---

## 致谢

- [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) — 多协议 Bot 框架，本插件运行基础
- [Miao-Yunzai](https://gitee.com/yoimiya-kokomi/Miao-Yunzai) — 优秀的 Yunzai 分支，插件兼容参考
- [rconsole-plugin](https://gitee.com/kyrzy0416/rconsole-plugin) — 点歌交互与卡片解析的设计参考

---

## License

[MIT](LICENSE)
