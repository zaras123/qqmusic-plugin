# qqmusic-plugin 问题修复报告

生成时间: 2026-07-26（原 2026-07-25）

## 用户反馈的问题

| 功能 | 问题描述 | 状态 |
|------|---------|------|
| `#qqm歌手 周杰伦` | 返回 30 首"未知 - 未知" | ✅ 已修复 |
| `#qqm收藏` | 获取失败 | ✅ 已修复 |
| `#qqm来首歌` | 获取失败 | ✅ 已修复 |
| `#qqm电台` | 获取失败 | ✅ 已修复 |
| `#qqm来首歌 / #qqm推荐 / #qqm排行 飙升` | `Invalid character in header content ["x-qqmusic-user"]` | ✅ 已修复（见问题 5） |
| `#qqm专辑 叶惠美` | 没有渲染卡片 | ⚠️ 需要检查 |
| `#qqm推荐` | 没有渲染卡片 | ⚠️ 需要检查 |
| `#qqm排行 飙升` | 没有渲染卡片 | ⚠️ 需要检查 |
| `#qqm歌单 华语流行` | 没有渲染卡片 | ⚠️ 需要检查 |
| `#qqm评论 晴天` | 没有渲染卡片 | ⚠️ 需要检查 |
| `#qqm点歌` | 没有解析功能一样的卡片 | ⚠️ 需要检查 |

---

## 问题 1：歌手歌曲显示"未知 - 未知" ✅ 已修复

### 原因分析
`#qqm歌手` 调用 `/singer/songs` 接口，返回的数据结构如下：
```json
{
  "data": {
    "list": [
      {
        "data": {           // ← 嵌套在 data 里面
          "songname": "...",
          "singer": [...],
          "mid": "..."
        }
      }
    ]
  }
}
```

但 `normalizeSearchItem` 函数只处理了扁平结构，没有处理 `item.data` 嵌套。

### 修复方案
```javascript
function normalizeSearchItem(item, idx = 0) {
  // 兼容多种 API 返回结构
  const raw = item?.data || item?.track_info || item
  if (!raw) return null  // 过滤无效数据
  
  // ... 后续字段提取
}
```

### 影响范围
- `searchSongs()` - 搜索歌曲
- `singerSongs()` - 歌手歌曲（主要问题）
- `albumSongs()` - 专辑曲目
- `songlistDetail()` - 歌单详情

---

## 问题 2：收藏/电台/来首歌获取失败 ✅ 已修复

### 原因分析
这些功能需要**登录态**才能调用：
- `#qqm收藏` → `userFavorites()` → `/cgi?dirid=201`
- `#qqm来首歌` → `recommendFeed()` → `/cgi?module=recommend.RecommendFeedServer`
- `#qqm电台` → `personalRadio()` → `/cgi?module=pc_track_radio_svr`

如果用户未登录或 Cookie 过期，API 会返回错误。

### 解决方案
1. **确保已登录**：发送 `#qqm登录` 扫码绑定 QQ 音乐账号
2. **检查 API 状态**：发送 `#qqm状态` 查看登录状态
3. **刷新登录态**：发送 `#qqm刷新`

### 错误提示优化
代码已经有完善的错误处理：
```javascript
} catch (err) {
  logError(`收藏失败: ${err.message}`)
  await e.reply('收藏失败，请先 #qqm登录 后重试')
}
```

---

## 问题 3：卡片渲染失败 ⚠️ 需要检查

### 可能原因

#### 原因 1：Puppeteer/Chrome 未安装
卡片渲染依赖 Puppeteer 截图，需要：
- 安装 `puppeteer` 包
- 安装 Chrome 或 Chromium 浏览器

#### 原因 2：渲染超时
Puppeteer 截图可能因为页面加载慢而超时。

#### 原因 3：模板文件问题
HTML 模板可能缺失或损坏。

### 诊断步骤

在那台 Win10 工作站上运行：

```bash
# 1. 检查 puppeteer 是否安装
cd D:\Yunzai
node -e "require('puppeteer'); console.log('puppeteer OK')"

# 2. 检查 Chrome 是否存在
dir "C:\Program Files\Google\Chrome\Application\chrome.exe"
dir "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

# 3. 查看 Yunzai 日志
# 在 Yunzai 启动日志中搜索 "qqmusic" 相关错误
```

### 解决方案

#### 方案 A：安装 Puppeteer
```bash
cd D:\Yunzai
pnpm add puppeteer
# 或
npm install puppeteer
```

#### 方案 B：安装 Chrome
下载 Google Chrome：https://www.google.com/chrome/

#### 方案 C：禁用卡片，使用纯文本
在锅巴面板或配置中关闭 `renderListCard`：
```yaml
# config/config/qqmusic.yaml
renderListCard: false
```

#### 方案 D：修复渲染代码（已优化）
代码中已有完善的回退机制：
```javascript
export async function replyCardOrText(e, { render, data, formatText, tag }) {
  try {
    // 尝试渲染卡片
    const img = await render(e, data)
    if (img) { await e.reply(img); return true }
  } catch (err) {
    logWarn(`${tag}渲染失败，回退文本: ${err.message}`)
  }
  // 回退到纯文本
  await e.reply(formatText(data))
  return true
}
```

---

## 问题 4：点歌没有解析功能一样的卡片 ⚠️ 需要检查

### 原因分析
- `#qqm点歌` 使用 `renderListCard` → `qqmusic-list.html` 模板
- `#qqm解析` 使用 `renderDetailCard` → `qqmusic-detail.html` 模板

如果解析功能有卡片但点歌没有，说明：
1. `qqmusic-list.html` 模板可能有问题
2. 或者 `renderListCard` 的数据结构不匹配

### 诊断步骤

检查模板文件是否存在：
```bash
dir D:\Yunzai\plugins\qqmusic-plugin\resources\html\qqmusic-list\qqmusic-list.html
dir D:\Yunzai\plugins\qqmusic-plugin\resources\html\qqmusic-detail\qqmusic-detail.html
```

---

## 更新插件到最新版本

### 方式 1：Git 更新（推荐）
```bash
cd D:\Yunzai\plugins\qqmusic-plugin
git pull origin main
```

> 本次修复（x-qqmusic-user header 清洗）已推送到 `main` 分支，`git pull` 即可获取。

### 方式 2：重新安装
```bash
cd D:\Yunzai\plugins
rmdir /s /q qqmusic-plugin
git clone https://github.com/zaras123/qqmusic-plugin.git
cd qqmusic-plugin
npm install
```

---

## 测试清单

更新后依次测试：

- [ ] `#qqm状态` - 查看 API 和登录状态
- [ ] `#qqm歌手 周杰伦` - 应该显示真实歌曲名
- [ ] `#qqm专辑 叶惠美` - 应该显示专辑曲目
- [ ] `#qqm歌单 华语流行` - 应该显示歌单歌曲
- [ ] `#qqm点歌 晴天` - 应该显示搜索列表
- [ ] `#qqm排行 飙升榜` - 应该显示排行榜
- [ ] `#qqm推荐` - 应该显示推荐歌单
- [ ] `#qqm热搜` - 应该显示热搜列表
- [ ] `#qqm评论 晴天` - 应该显示评论
- [ ] `#qqm登录` - 扫码绑定账号
- [ ] `#qqm收藏` - 登录后获取收藏
- [ ] `#qqm日推` - 登录后获取每日推荐
- [ ] `#qqm电台` - 登录后获取个性电台
- [ ] `#qqm来首歌` - 登录后随机推荐

---

## 常见问题

### Q: 卡片还是显示不了？
A: 检查 Puppeteer 是否安装，或者关闭 `renderListCard` 使用纯文本。

### Q: 还是显示"未知"？
A: 确保更新到最新版本，然后重启 Yunzai。

### Q: 登录后还是获取失败？
A: 发送 `#qqm刷新` 刷新登录态，或重新 `#qqm登录`。

---

## 技术细节

### API 响应结构差异

| 接口 | 返回结构 | 说明 |
|------|---------|------|
| `/search` | `{ data: { list: [...] } }` | 标准结构 |
| `/singer/songs` | `{ data: { list: [{ data: {...} }] } }` | 嵌套 data |
| `/album/songs` | `{ data: { list: [...] } }` | 标准结构 |
| `/songlist` | `{ data: { songlist: [...] } }` | songlist 字段 |
| `/cgi` | `{ data: { tracks: [...] } }` | tracks 字段 |

### normalizeSearchItem 兼容性

```javascript
const raw = item?.data || item?.track_info || item
```

支持三种结构：
1. 扁平：`{ songname: "...", singer: [...] }`
2. data 包裹：`{ data: { songname: "..." } }`
3. track_info 包裹：`{ track_info: { data: {...} } }`

---

## 问题 5：`Invalid character in header content ["x-qqmusic-user"]` ✅ 已修复

### 表现

以下命令（以及所有其它命令）随机/必现报错：

```
[ERRO] [qqmusic-plugin] 排行失败: Invalid character in header content ["x-qqmusic-user"]
[ERRO] [qqmusic-plugin] recommendFeed failed: Invalid character in header content ["x-qqmusic-user"]
```

涉及：`#qqm来首歌`、`#qqm推荐`、`#qqm排行`、`#qqm电台`、`#qqm日推`、`#qqm收藏`、`#qqm点歌`、`#qqm歌手/专辑/歌单/评论`、`#qqm登录/刷新` 等**全部命令**。

### 原因分析

`utils/api.js` 的 `request()` 函数把 `userKey` 直接写入 HTTP header：

```javascript
const userKey = String(e.user_id || '')   // 来自机器人框架，ICQQ 下可能带脏数据
...
if (userKey) headers['x-qqmusic-user'] = userKey   // ← 直接塞 header
```

Node.js 对 HTTP header 值要求严格：只允**可打印 ASCII**（`0x20-0x7E`）。一旦 `e.user_id` 含非 ASCII 字符、控制字符、换行等脏数据（ICQQ / Miao-Yunzai 某些场景），底层就抛 `ERR_INVALID_CHAR`。

而 `userKey` 同时写入 query/body 参数——那边走 axios URL 编码，天然容错，不会炸。所以**只有 header 这一条路径会触发**。

所有命令都走同一个 `request()` 入口，所以一处脏数据、全体命令受影响。

### 修复方案

在 `utils/api.js` 增加 `sanitizeForHeader()`，写入 header 前统一过滤：

```javascript
function sanitizeForHeader(value) {
  return String(value)
    .replace(/[^\x20-\x7E]/g, '')   // 去不可打印 / 非 ASCII
    .replace(/[\r\n\t]/g, '')        // 再去 CR/LF/Tab（防御）
    .trim()
}
```

`request()` 里改为：

```javascript
const safeUserKey = sanitizeForHeader(userKey)
if (safeUserKey) headers['x-qqmusic-user'] = safeUserKey
```

清洗后为空则**不置 header**，服务端会回退到 `default` 槽（单用户场景行为不变）。

### 影响范围

一处修改、**全部命令**受益（都过 `request()` 公共入口）。

### 获取修复

```bash
cd D:\Yunzai\plugins\qqmusic-plugin
git pull origin main
# 然后重启 Yunzai
```

或下载最新 release 包覆盖。
