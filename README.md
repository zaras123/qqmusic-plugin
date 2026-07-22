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

## 功能一览

| 分类 | 功能 | 说明 |
|------|------|------|
| 🎵 点歌 | `#qqm点歌 关键词` | 搜索列表，`#qqm听N` 选曲播放 |
| 🎵 点歌 | `#qqm播放 关键词` | 直接播放第一条 |
| 🎵 点歌 | `#qqm歌词 关键词` | 歌词查询 |
| 🎵 点歌 | `#qqm热搜` | 热搜榜 |
| 🎵 点歌 | `#qqm帮助` | 帮助图片卡片 |
| 🔗 解析 | 群内发 QQ 音乐分享 / 链接 | 自动识别并下载播放 |
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

主人发送 `#qqm登录` 扫码即可开始使用。

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
│   ├── resolve.js           # 分享/链接解析
│   ├── login.js             # 扫码登录
│   └── admin.js             # 配置管理
├── utils/
│   ├── api.js               # API 客户端
│   ├── send.js              # 消息发送（按适配器分流）
│   ├── render.js            # 图片卡片渲染
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

## License

[MIT](LICENSE)
