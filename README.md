<p align="center">
  <img src="https://raw.githubusercontent.com/zaras123/qqmusic-plugin/karin/resources/img/logo.png" width="120" alt="QQ 音乐插件 Logo">
</p>

<h1 align="center">karin-plugin-qqmusic</h1>

<p align="center"><strong>node-karin · 点歌 / 解析 / 本地曲库</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT">
  <img src="https://img.shields.io/github/stars/zaras123/qqmusic-plugin?style=flat&logo=github" alt="GitHub Stars">
</p>

<p align="center">
  <a href="https://github.com/zaras123/qqmusic-plugin">
    <img src="https://count.getloli.com/get/@zaras123.qqmusic-plugin?theme=rule34" alt="访问次数">
  </a>
</p>

## API 与用户群

**插件开源，配套的 `qqmusic-api-enhanced` 后端 API 不开源。** 使用前请加入 [QQ 用户群](https://qm.qq.com/q/GKxEVvF8Ua)，申请 **API 地址和 Token**。群内提供使用反馈与更新通知。

## 安装

准备好对应的机器人框架、Node.js、pnpm 和 FFmpeg（`ffmpeg`、`ffprobe`）。按框架选择一种安装方式；下列命令均从对应框架的根目录执行。

### Yunzai / TRSS-Yunzai · main 分支

```bash
git clone --branch main https://github.com/zaras123/qqmusic-plugin.git plugins/qqmusic-plugin
cd plugins/qqmusic-plugin
pnpm install
```

完成后重启 Yunzai / TRSS-Yunzai。

### Karin · karin 分支

推荐使用 npm 包：

```bash
pnpm add karin-plugin-qqmusic
```

需要修改源码时，也可以使用 Git 安装：

```bash
git clone --branch karin https://github.com/zaras123/qqmusic-plugin.git plugins/karin-plugin-qqmusic
cd plugins/karin-plugin-qqmusic
pnpm install
pnpm build
```

完成后重启 Karin。npm 与 Git 安装选一种即可，避免重复加载。

[Yunzai / TRSS-Yunzai 分支](https://github.com/zaras123/qqmusic-plugin/tree/main) · [Karin 分支](https://github.com/zaras123/qqmusic-plugin/tree/karin)

## 配置与开始使用

1. 在 **锅巴（Yunzai）或 Karin WebUI** 填写申请到的 API 地址和 Token。
2. QQ 音乐账号由主人发送 `#qqm登录` 扫码登录；其他平台的凭据方式见 `#qqm登录帮助`，凭据只在私聊或配置界面填写。
3. 发送 `#qqm点歌 晴天`，再用 `#qqm听1` 播放；`#qqm播放 晴天` 可直接播放第一首。

| 框架 | 用户配置文件（相对框架根目录） |
| --- | --- |
| Yunzai / TRSS-Yunzai | `plugins/qqmusic-plugin/config/config/qqmusic.yaml` |
| Karin | `@karinjs/karin-plugin-qqmusic/config/qqmusic.yaml` |

多平台功能需在设置中开启「？？？」；随后可按需启用各音源平台。**本地曲库优先**默认开启，仍保留 QQ 官方和已启用的第三方结果；关闭此项后，搜索、播放和链接解析均不再查本地曲库。音质与可用功能以实际音源、账号权限及 API 支持为准。

## 帮助卡片

支持点歌、歌词、MV、音乐链接解析、演出票务、订阅、定时和听歌统计等。发送 `#qqm帮助` 查看入口，`#qqm帮助 全部` 查看完整清单；也可以直接发送 `#qqm点歌帮助`、`#qqm平台帮助` 等分类命令。

下面是当前版本的默认帮助卡片示例（含主人入口）；实际内容会随身份和配置变化。

<p align="center">
  <a href="https://raw.githubusercontent.com/zaras123/qqmusic-plugin/karin/resources/img/help.png">
    <img src="https://raw.githubusercontent.com/zaras123/qqmusic-plugin/karin/resources/img/help.png" width="720" alt="QQ 音乐插件帮助卡片，点击查看原图">
  </a>
</p>

## 更新与排错

- Git 安装：在插件目录运行 `git pull`；Karin 源码更新后再运行 `pnpm build`，然后重启框架。
- Karin npm 安装：在 Karin 根目录运行 `pnpm up karin-plugin-qqmusic`，然后重启。
- 语音发送需同时能调用 `ffmpeg` 和 `ffprobe`。2.1.14 会拦截残缺音频；官方来源出现噪声或残缺时，还需向维护者获取 API 解密修复，并重新下载损坏文件。
- 反馈问题请附框架、分支、版本和错误日志，并遮挡 Token、Cookie 等凭据。

## AI 辅助开发声明

**本插件部分代码由 AI 辅助完成。** 可能存在尚未发现的逻辑缺陷、兼容性或安全问题，请在理解并审查代码后部署，不要将未经验证的代码直接用于生产或商业项目。发现问题欢迎通过 Issue 反馈或提交修复。

本项目仅供技术学习与交流，请遵守相关法律法规和平台用户协议，勿用于侵犯他人权益的用途。

## License

MIT
