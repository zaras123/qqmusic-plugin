<p align="center">
  <img src="https://raw.githubusercontent.com/zaras123/qqmusic-plugin/karin/resources/img/logo.png" width="120" alt="karin-plugin-qqmusic logo">
</p>

<h1 align="center">karin-plugin-qqmusic</h1>

<p align="center">
  <strong>node-karin QQ 音乐点歌、解析与本地曲库插件</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="node">
  <img src="https://img.shields.io/badge/node--karin-1.18+-blue" alt="karin">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="license">
</p>

## 安装

```bash
pnpm add karin-plugin-qqmusic
```

也可以使用 git：

```bash
git clone --branch karin https://github.com/zaras123/qqmusic-plugin.git karin-plugin-qqmusic
```

安装后填写 `qqmusic-api-enhanced` 地址和 Token，发送 `#qqm点歌 晴天`。

## 主要功能

- QQ 音乐搜索、点歌、音质降级、歌词、MV 和链接解析。
- 本地曲库优先：先列本地命中，同时保留 QQ 官方搜索和已启用的第三方填充。
- Karin WebUI 可独立关闭本地曲库；关闭后搜索、播放和链接解析全部传 `local=0`。
- 支持多平台来源标签、账号凭据、四套卡片主题和平台时长任务。

## 文档

- [2.1.11 更新说明](https://github.com/zaras123/qqmusic-plugin/blob/karin/docs/releases/2.1.11.md)

- [完整使用与部署指南](https://github.com/zaras123/qqmusic-plugin/blob/karin/docs/full-guide.md)
- [本地曲库与渠道显示](https://github.com/zaras123/qqmusic-plugin/blob/karin/docs/local-library.md)
- [平台时长任务](https://github.com/zaras123/qqmusic-api-enhanced/blob/main/docs/listening-api.md)

## 常用命令

```text
#qqm点歌 晴天
#qqm听1
#qqm播放 晴天
#qqm平台状态
#qqm刷歌帮助
#qqm刷歌状态
```

## License

MIT
