<p align="center">
  <img src="resources/img/logo.png" width="120" alt="logo">
</p>

<h1 align="center">qqmusic-plugin</h1>

<p align="center"><strong>Yunzai / TRSS-Yunzai QQ 音乐点歌、解析与本地曲库插件</strong></p>

## 快速开始

1. 安装并登录 [qqmusic-api-enhanced](https://github.com/zaras123/qqmusic-api-enhanced)。
2. 把本目录放入 `Yunzai/plugins/qqmusic-plugin`。
3. 在锅巴中填写 API 地址和 Token。
4. 发送 `#qqm点歌 晴天`。

## 主要功能

- QQ 音乐搜索、点歌、音质降级、歌词、MV 和链接解析。
- 本地曲库优先：列表先显示本地命中，同时保留 QQ 官方结果和启用的第三方填充渠道。
- 锅巴提供「本地曲库优先」开关；关闭后搜索、播放和链接解析全部传 `local=0`。
- 多平台来源、平台凭据、卡片主题、平台时长任务和故障排查详见文档。

## 文档

- [2.1.11 更新说明](docs/releases/2.1.11.md)

- [完整使用与部署指南](docs/full-guide.md)
- [本地曲库与渠道显示](docs/local-library.md)
- [平台时长任务](https://github.com/zaras123/qqmusic-api-enhanced/blob/main/docs/listening-api.md)

[帮助分类与简短计划命令](docs/help-navigation.md)

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

## 2.1.14 音频完整性修复

发送前验证实际解码与转码时长，拒绝残缺音频；不再复用未验证的压缩缓存或在校验失败后发送损坏原文件。新增不含凭据的取流链路诊断日志。语音发送需要可用的 `ffmpeg` 和 `ffprobe`。官方音源还应同时更新 API 的 RC4 分段解密修复。
