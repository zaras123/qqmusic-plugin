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
| 🎵 点歌 | `#qqm点歌 关键词` | 搜索列表，`#qqm听N` 选曲播放 |
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
| 🎧 发现 | `#qqm歌手 关键词` | 搜索歌手，展示热门歌曲 |
| 🎧 发现 | `#qqm专辑 关键词` | 搜索专辑，展示曲目列表 |
| 🎧 发现 | `#qqm歌单 关键词` | 搜索歌单，展示歌曲 |
| 🎧 发现 | `#qqm评论 关键词` | 查看歌曲热门评论 |
| 🔗 解析 | 群内发 QQ 音乐分享 / 链接 | 自动识别并下载播放（免费音乐未登录也可解析，但仍需 api 鉴权 token） |
| 🔗 解析 | 专辑 / 歌单 / 歌手链接 | 自动识别并展示歌曲列表 |
| 🔐 登录 | `#qqm登录` | 扫码登录（主人） |
| 🔐 登录 | `#qqm绑定 qqmusic://...` | DeepLink 导入（主人） |
| 🔐 登录 | `#qqm状态` / `#qms` | 登录状态卡片 |
| 🔐 登录 | `#qqm登出` | 清除登录态（主人） |
| 🔐 登录 | `#qqm刷新` | 续期 key（主人） |
| ⚙️ 配置 | `#qqm设置` | 查看当前配置 |
| ⚙️ 配置 | `#qqm api <地址>` | 设置 API 地址（主人） |
| ⚙️ 配置 | `#qqm 音质 flac` | 设置最高音质（主人） |
| ⚙️ 配置 | `#qqm 开启/关闭 点歌/解析` | 功能开关（主人） |
| ⚙️ 配置 | `#qqm 测试` | 测试 API 连通（主人） |
| 🔄 更新 | `#qqm更新` | 拉取最新插件代码（主人，需 git 安装） |
| 🔄 更新 | `#qqm强制更新` | 丢弃本地改动并同步远程（主人） |
| 🔄 更新 | `#qqm更新日志` | 查看最近提交（主人） |

### 音质选项

`128` / `m4a` / `320` / `flac` / `ape` / `hires` / `atmos` / `master` / `atmos_master`

默认 `auto`：自动匹配歌曲最高可用音质，支持逐级降级。

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
| 群文件 | ✅ | ✅ | ✅ |
| 原生音乐卡 | 视协议 | 视协议 | — |

---

## 项目结构

```
qqmusic-plugin/
├── index.js                 # 入口
├── apps/
│   ├── song.js              # 点歌
│   ├── chart.js             # 排行榜、推荐、电台、日推、收藏
│   ├── explore.js           # 歌手、专辑、歌单、评论
│   ├── resolve.js           # 分享/链接解析
│   ├── login.js             # 扫码登录
│   └── admin.js             # 配置管理
├── utils/
│   ├── api.js               # API 客户端
│   ├── send.js              # 消息发送（按适配器分流）
│   ├── render.js            # 图片卡片渲染
│   ├── card-data.js         # 卡片数据构建
│   └── adapter.js           # 适配器识别
├── components/Config.js     # 配置读写
├── config/
│   ├── default_config/      # 默认配置
│   └── config/              # 运行时配置
└── resources/               # 渲染模板与资源
```

---

## 锅巴配置

安装 [Guoba-Plugin](https://github.com/guoba-yunzai/guoba-plugin) 后可在网页配置：

- API 地址 / Token
- 最高音质 / 自动降级
- 语音 / 群文件 / 音乐卡开关
- 点歌 / 解析功能开关
- 登录状态查询

---

## 致谢

- [TRSS-Yunzai](https://gitee.com/TimeRainStarSky/Yunzai) — 多协议 Bot 框架，本插件运行基础
- [Miao-Yunzai](https://gitee.com/yoimiya-kokomi/Miao-Yunzai) — 优秀的 Yunzai 分支，插件兼容参考
- [rconsole-plugin](https://gitee.com/kyrzy0416/rconsole-plugin) — 点歌交互与卡片解析的设计参考

---

## License

[MIT](LICENSE)
