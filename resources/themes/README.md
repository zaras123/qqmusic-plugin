# 卡片主题（多套 UI）

插件所有图片卡片都由这里的主题渲染。**丢一个目录进来就是一套新 UI**，不用改代码。

```
resources/themes/
├── classic/     # 内置：插件的原始界面（默认，浅色）
├── apple/       # 内置：对标 iOS 的分组列表风格（浅色 + 深色 + 自定义背景）
├── nebula/      # 内置：2.0 专版「星云 · 鎏光」—— 液态玻璃 + 香槟金烫字（暖象牙底，2.0 默认）
└── multi/       # 内置：2.0 专版「多平台」—— 冷中性底 + 单一主光，来源色标（色轨/色点/同色玻璃）当主角
```

> 内置主题里的 `nebula` / `multi` 是 **2.0 专版**：它们只在配置打开 `？？？`（键名 `unlockV2`）
> 之后才会被渲染（2.0 默认走 `nebula`，见 `theme.json` 与 `utils/theme.js`）。没解锁时插件
> 用的还是 `uiTheme`，看到的东西与 2.0 之前逐字一致。

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
| `bg` | 是否支持**自定义背景**（本地路径 / 图片直链 / 图片 API）。为 `true` 时，用户开启自定义背景后 `<html>` 会多一个 `data-bg="1"`，主题可据此整套换材质（apple 就是靠它切到 iOS 液态玻璃）。没声明的主题完全不受影响 |
| `pageBg` | 页面底色。**必须不透明** —— QQ 会把透明 PNG 填成白底 |
| `viewportWidth` | 截图视口宽度（默认 640） |
| `cardWidth` | 单张卡的宽度覆盖，如详情卡用 580 |

3. 放卡片模板 `<卡片名>.html`，**只实现你想改的那几张也行**，缺的会自动回落到 `classic` 的同名模板。

   > ⚠️ **跟插件一起分发的那几套内置主题必须把卡片实现全**：缺一张就回落 `classic`，
   > 于是"内容是这套主题的、皮肤是经典绿"，看着像两套 UI 拼在一起（2026-09-23 实测：
   > `apple` 少了 `qqmusic-platform` / `qqmusic-platforms` 两张 2.0 卡，2.0 下用苹果皮肤时
   > 平台卡整套变成经典绿）。`test.mjs` 里有这条断言，它**只查内置的四套** ——
   > 你自己加的主题按上面这条契约可以只实现部分卡片。

可用的卡片名：`qqmusic-help`、`qqmusic-guide`、`qqmusic-platform`、`qqmusic-platforms`、`qqmusic-list`、`qqmusic-detail`、`qqmusic-lyric`、`qqmusic-hot`、`qqmusic-comment`、`qqmusic-status`、`qqmusic-settings`。

> ⚠️ **卡片名相同 = `data` 形状相同**。`qqmusic-help`（1.x 帮助卡）与 `qqmusic-guide`（2.0 帮助卡）
> 是**两张卡、两种数据**，别把一张的模板复制成另一张。2026-09-23 实测踩过：`nebula` / `multi` 的
> `qqmusic-help.html` 当年就是照 guide 抄的，于是**没解锁 `？？？` 却把 `uiTheme` 选成这两套皮肤**时，
> 帮助卡出来是一张残卡（统计栏空白、音源清单整段消失）—— 2.0 下走的是 `qqmusic-guide`，反而看不出来。
> 内置主题里 1.x 那几张卡（status/settings/lyric/hot/comment/help）是**逐字复用 apple 的模板、只换
> `_base.css` 的链接**；list/detail 因为 2.0 的来源色标重画过，是有意不一致的。

## 2.0 专用的三张卡

`？？？` 打开后插件会多渲染三张卡。文件名与其它卡一样，只是 `data` 的形状不同
（都出自 `utils/card-data.js`，模板只负责画，别自己算）：

| 卡片 | 什么时候发 | `data` 上有什么 |
|---|---|---|
| `qqmusic-guide` | `#qqm帮助`（2.0 打开时） | `version`/`logo`/`title`/`subtitle`、统计（`statPlatforms`/`statPlatformsTotal`/`statCommands`/`statQuality`/`statMode`）、`sources[]`、`sections[]`、`tip` |
| `qqmusic-platform` | `#qqm<平台>状态`（如 `#qqm网易状态`） | `title`/`subtitle`/`logo`、`row`（单行，见下）、`commands[]`（`name`/`example`/`desc`）、`tips[]` |
| `qqmusic-platforms` | `#qqm平台状态` | `title`/`subtitle`、`total`/`readyCount`/`canQrCount`、`rows[]`、`tips[]` |

`row` 就是"一个平台一行"，`utils/card-data.js` 的 `platformStatusRow()` 产出：

```
label  short  color  kindText(账号/凭据/音源/匿名)  ready  stateText  quality
sourceText  detail  canQr  ownersCount  unreliable  note  action(下一步该发什么)
```

- `ready` = 能不能用（匿名音源恒真、Apple 看有没有启用、其余看登录态），`stateText` 是给人看的说法
- `action` 是**可操作的那一步**，由 `utils/platforms.js` 的凭据注册表决定：能扫码的给 `#qqm<平台>登录`，
  只能粘贴 cookie 的给 `#qqm<平台>ck`（私聊），两者都没有（匿名音源 / YouTube）是空串
- 帮助卡的音源清单**同时给两种形状**：`sources[]`（新的，多带 `short`/`needsCredential`）与
  `sections[0].platforms[]`（老的）。老主题继续读 `sections`，2.0 主题读 `sources`，两边模板都不用改 ——
  **写预览样例时也要两份都给**，只给老的那份的话，2.0 帮助卡里"一行一个音源"那整段在预览里会缺席
  （`scripts/preview-samples.mjs` 已经按这个来了）。

## 预览样例（夹具）

每张卡的样例 `data` 都在 **`scripts/preview-samples.mjs`** —— 它是个**纯数据模块**
（只 import node 内置模块、不碰 `utils/*`），所以 `test.mjs` 也能安全 import 它。

> ⚠️ **改了模板就要顺手看一眼夹具**。`test.mjs` 会逐卡片检查"模板读到的每个 `data.X`
> 都是该卡夹具的顶层键"（区分大小写），漏了就报错。以前没这道闸：模板里加了个
> `{{data.sourceShort}}`，夹具里没这个键，art-template 就把空值**原样画出去**（星云详情卡
> 那颗空胶囊），而真机数据由 `utils/card-data.js` 构建、字段齐全 —— 于是只有预览在骗人，
> 肉眼评审时还会以为是主题画错了。

夹具里的值要**照真机口径写**（来源短名走 `utils/platforms.js` 的 `platformShort()`，不是自己
编一个；卡片里**不准出现 API 地址**，所以 `apiHint` 是空串）。演示哪一面也有讲究：详情卡默认
画的是**外源曲**那一版，因为 QQ 绿正好等于 `--src` 的兜底色，用 QQ 曲预览等于没验证"来源色
真的从数据流进了样式"这条管道。

## 模板约定

- 语法是 **art-template**，数据在 `data` 上（如 `{{data.keyword}}`、`{{each data.songs song}}`）
- 最外层必须是 `.page` → `.card`（渲染器就截这个块）
- 相对路径以 `resources/` 开头，渲染时会改写成绝对 `file://` URL。共享样式可以放主题目录里再 `<link rel="stylesheet" href="resources/themes/<id>/xxx.css">`（一份 CSS 服务多张卡）
- `<html>` 上会被注入 `data-theme="<主题id>"` 与 `data-mode="light|dark"`，深浅色在 CSS 里用 `html[data-mode="dark"] { ... }` 覆盖变量即可 —— **不要**依赖 `prefers-color-scheme`（渲染时不一定一致）

## 支持自定义背景（可选）

声明 `"bg": true` 后，用户在锅巴/`#qqm界面 背景 <路径或链接>` 打开背景时，渲染器会：

1. 把背景图解析成本地 `file://` 地址（远端图由 Node 侧取回并缓存，**不会**让 Chrome 去等远端图，否则会把渲染拖死）；
2. 在 `<html>` 上加 `data-bg="1"`；
3. 在 `</head>` 前内联一段 `<style>:root{--bg-image:url("…")}</style>`。

主题要做的就是写 `html[data-bg="1"]` 那套样式。apple 的做法可以直接抄（`_base.css` 末尾那段注释里写了思路）：整页铺 `var(--bg-image)` → `.page::before` 用 `backdrop-filter: blur() brightness()` 把墙纸柔化并**归正明度**（这样不管用户放深图还是浅图，玻璃上的字都还能读）→ `.card` 再叠一层高模糊高饱和的玻璃 + 亮 rim + 顶缘高光。

> ⚠️ 背景图不受主题控制，所以**别把文字直接压在背景上**：一定要有玻璃/实底垫着，并且次级文字用更实的颜色（apple 在背景模式下把 `--label-2/-3` 加深了一档）。

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
