# 卡片主题（多套 UI）

插件所有图片卡片都由这里的主题渲染。**丢一个目录进来就是一套新 UI**，不用改代码。

```
resources/themes/
├── classic/     # 内置：插件的原始界面（默认，浅色）
└── apple/       # 内置：对标 iOS 的分组列表风格（浅色 + 深色）
```

## 加一套自己的主题

1. 新建目录 `resources/themes/<你的主题id>/`
2. 放一个 `theme.json`（字段都可省略，省略就用默认值）：

```json
{
  "id": "mytheme",
  "name": "我的主题",
  "desc": "一句话说明，会显示在 #qqm界面 里",
  "dark": false,
  "pageBg": { "light": "#F2F2F7", "dark": "#000000" },
  "viewportWidth": 640,
  "cardWidth": { "qqmusic-detail": 580 }
}
```

| 字段 | 作用 |
|---|---|
| `dark` | 是否支持深色。为 `true` 时才需要 `pageBg.dark`，配置里的「深色界面」也只对这类主题生效 |
| `pageBg` | 页面底色。**必须不透明** —— QQ 会把透明 PNG 填成白底 |
| `viewportWidth` | 截图视口宽度（默认 640） |
| `cardWidth` | 单张卡的宽度覆盖，如详情卡用 580 |

3. 放卡片模板 `<卡片名>.html`，**只实现你想改的那几张也行**，缺的会自动回落到 `classic` 的同名模板。

可用的卡片名：`qqmusic-help`、`qqmusic-list`、`qqmusic-detail`、`qqmusic-lyric`、`qqmusic-hot`、`qqmusic-comment`、`qqmusic-status`、`qqmusic-settings`。

## 模板约定

- 语法是 **art-template**，数据在 `data` 上（如 `{{data.keyword}}`、`{{each data.songs song}}`）
- 最外层必须是 `.page` → `.card`（渲染器就截这个块）
- 相对路径以 `resources/` 开头，渲染时会改写成绝对 `file://` URL。共享样式可以放主题目录里再 `<link rel="stylesheet" href="resources/themes/<id>/xxx.css">`（一份 CSS 服务多张卡）
- `<html>` 上会被注入 `data-theme="<主题id>"` 与 `data-mode="light|dark"`，深浅色在 CSS 里用 `html[data-mode="dark"] { ... }` 覆盖变量即可 —— **不要**依赖 `prefers-color-scheme`（渲染时不一定一致）

## 生效方式（热更新）

- 换了主题 / 改了模板文件 / 改了 theme.json：**都不用重启机器人**，下一次发卡就生效（按文件 mtime 自动失效编译缓存）
- 一次改了一大批、或想强制重来：主人发 `#qqm界面 重载`
- 本地看效果（不经过机器人）：

```bash
node scripts/preview-cards.mjs              # 所有主题 × 所有卡 × 浅/深
node scripts/preview-cards.mjs mytheme      # 只看某个主题
node scripts/preview-cards.mjs apple qqmusic-list
```

产物在 `temp/preview/<主题>[-dark]/<卡>.png`。预览走的是**和生产同一条**渲染路径，所见即真机所发。
