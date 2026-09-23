#!/usr/bin/env node
/**
 * 异步用法静态体检（零依赖：node scripts/check-async.mjs [插件根目录]）
 *
 * 钉的是「同一个插件在两套框架（TRSS-Yunzai / Miao-Yunzai）上都能安全异步」这件事：
 *
 *  R1  裸 `.then` / `.catch` / `.finally`
 *      接收者不保证是 Promise 时挂回调，要么当场 `.then is not a function`，
 *      要么回调静默丢失。已知返回 Promise 的链头在 SAFE_ANCHORS 里；
 *      其余请走 utils/async.js 的 toPromise / thenSafe / replySafe，
 *      或在**同一行**行尾写 `// async-ok` 说明为什么这里安全。
 *
 *      这不是假想的坑：apps/chart.js 的 MV 发送原来就是
 *      `e.reply(seg.video(...)).then(() => true)` —— 而 `e.reply`
 *      在「适配器没装 reply」时（TRSS lib/plugins/loader.js:416 直接 return）
 *      压根不存在，插件基类的 reply() 又会在空消息时**同步**返回 false，
 *      两边框架的返回值形态并不一致，`.then` 随时可能是 undefined。
 *
 *  R2  异步定时器
 *      `setTimeout(async …)` / `setInterval(async …)` / `setTimeout(<某个 async 函数名>, …)`
 *      —— 回调抛错没人接，变成 unhandledRejection，框架只在 process 级记一行日志，
 *      业务侧既看不到也补不了兜底。改用 utils/async.js 的 setSafeTimeout。
 *
 * 退出码：0 = 干净；1 = 有发现。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..')

/**
 * 允许直接挂回调的链头（确定返回 Promise 的）
 * 加上两条本仓库的命名约定：`xxxAsync`、`render*`（utils/render.js 里全是 async）
 */
const SAFE_ANCHORS = new Set([
  'Promise',
  'thenSafe',
  'toPromise',
  'invoke',
  'replySafe',
  'axios',
  'request',
  'fetch',
  'import',
  'sleep',
  'withRetry',
  // 本仓库自己「返回 Promise 但没写 async 关键字」的：
  // 它要把并发调用收敛成同一个 Promise，加了 async 反而会每次包一层新的
  'loadPluginBase',
])

/** 收集 async 声明名（R2 要用：setTimeout(tick, …) 里的 tick 是不是 async） */
const ASYNC_DECL_RES = [
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g,
  /([A-Za-z_$][\w$]*)\s*=\s*async\s*(?:\(|function\b)/g,
  /async\s+function\s+([A-Za-z_$][\w$]*)/g,
  /\basync\s+([A-Za-z_$][\w$]*)\s*\(/g,
]

const CHAIN_RE = /\.(then|catch|finally)\s*\(/g
const TIMER_RE = /(setTimeout|setInterval)\s*\(/g
/** 箭头函数形参：形参不是「声明过的 async 函数」，要从 asyncNames 里剔掉 */
const ARROW_PARAM_RE = /\(\s*([^)]*)\)\s*=>/g

/** 递归收集插件自身的 js/mjs（与 test.mjs 同一套跳过规则） */
function collectFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'temp') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collectFiles(p, out)
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}

/** 注释/字符串/正则里的内容换成空格（等长，换行保留 → 行号/列号仍对得上） */
function sanitize(src) {
  const n = src.length
  const out = []
  const blank = (c) => (c === '\n' ? '\n' : ' ')
  let i = 0

  /** `/` 在这个位置能不能起一个正则（简易判断：前一个有意义字符是运算符/括号/关键字） */
  const regexAllowed = (idx) => {
    let j = idx - 1
    while (j >= 0 && /\s/.test(src[j])) j--
    if (j < 0) return true
    if ('([,=:[!&|?{};+-*%~^<>'.includes(src[j])) return true
    const before = src.slice(Math.max(0, j - 12), j + 1)
    return /(?:^|[^\w$.])(return|typeof|instanceof|new|delete|void|case|do|else|yield|await|in|of)$/.test(before)
  }

  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out.push(' '); i++ }
      continue
    }
    if (c === '/' && c2 === '*') {
      out.push('  '); i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(blank(src[i])); i++ }
      if (i < n) { out.push('  '); i += 2 }
      continue
    }
    if (c === '/' && regexAllowed(i)) {
      let inClass = false
      out.push(' ')
      i++
      while (i < n) {
        const d = src[i]
        if (d === '\\') { out.push('  '); i += 2; continue }
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) { out.push(' '); i++; break }
        else if (d === '\n') { out.push('\n'); i++; break }
        out.push(' ')
        i++
      }
      while (i < n && /[a-z]/.test(src[i])) { out.push(' '); i++ }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      out.push(q)
      i++
      while (i < n) {
        if (src[i] === '\\') { out.push('  '); i += 2; continue }
        if (src[i] === q) { out.push(q); i++; break }
        out.push(blank(src[i]))
        i++
      }
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

const isIdentChar = (c) => c != null && /[A-Za-z0-9_$]/.test(c)

function lineOf(text, idx) {
  let line = 1
  for (let i = 0; i < idx; i++) if (text[i] === '\n') line++
  return line
}

function colOf(text, idx) {
  const nl = text.lastIndexOf('\n', idx - 1)
  return idx - nl
}

/** 从右往左找与 closeIdx 处的 `)` 配对的 `(` */
function matchOpenParen(text, closeIdx) {
  let depth = 0
  for (let i = closeIdx; i >= 0; i--) {
    if (text[i] === ')') depth++
    else if (text[i] === '(') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 从 `.then(` 的点的位置往前回溯整条调用链，返回链上的标识符（如 ['e','reply']）
 * 回溯时会跳过已配对的括号组，所以跨行的链式写法也认。
 */
function chainAnchor(text, dotIdx) {
  let j = dotIdx - 1
  const segs = []
  let guard = 0
  while (guard++ < 32) {
    while (j >= 0 && /\s/.test(text[j])) j--

    // 已配对的括号组：`request(...).then(...)` / `foo().bar()` 都要能穿过去
    if (text[j] === ')') {
      const open = matchOpenParen(text, j)
      if (open < 0) return null
      j = open - 1
      continue
    }

    const end = j
    while (j >= 0 && isIdentChar(text[j])) j--
    if (j === end) break
    segs.unshift(text.slice(j + 1, end + 1))

    // 链子还有上一层（前面是 `.`）就接着往上认
    let k = j
    while (k >= 0 && /\s/.test(text[k])) k--
    if (text[k] !== '.') break
    j = k - 1
  }
  return segs.length ? segs : null
}

/** 第一个实参的文本（顶层逗号/右括号截断） */
function firstArg(text, openIdx) {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return text.slice(openIdx + 1, i)
    } else if (c === ',' && depth === 1) return text.slice(openIdx + 1, i)
  }
  return text.slice(openIdx + 1)
}

function isSafeAnchor(seg, asyncNames) {
  if (SAFE_ANCHORS.has(seg)) return true
  if (asyncNames.has(seg)) return true
  if (/Async$/.test(seg)) return true
  if (/^render[A-Z]/.test(seg)) return true
  return false
}

const findings = []
const files = collectFiles(root)

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const src = fs.readFileSync(file, 'utf8')
  const text = sanitize(src)
  const srcLines = src.split(/\r?\n/)

  const asyncNames = new Set()
  for (const re of ASYNC_DECL_RES) {
    re.lastIndex = 0
    let mm
    while ((mm = re.exec(text))) asyncNames.add(mm[1])
  }
  // 剔掉形参名：`new Promise((r) => setTimeout(r, 10))` 里的 r 不是 async 声明
  // （不剔的话，文件里只要有个 `async r()` 就会把这种标准写法误判成异步定时器）
  ARROW_PARAM_RE.lastIndex = 0
  let pm
  while ((pm = ARROW_PARAM_RE.exec(text))) {
    for (const part of pm[1].split(',')) {
      // 取这一段里的第一个标识符（形参可能带默认值/解构，也可能被嵌套括号带上 '('）
      const name = (part.match(/[A-Za-z_$][\w$]*/) || [])[0]
      if (name) asyncNames.delete(name)
    }
  }

  // ── R1：裸 then/catch/finally ──
  CHAIN_RE.lastIndex = 0
  let m
  while ((m = CHAIN_RE.exec(text))) {
    const raw = srcLines[lineOf(text, m.index) - 1] || ''
    if (raw.includes('async-ok')) continue
    const anchor = chainAnchor(text, m.index)
    if (anchor && anchor.some((s) => isSafeAnchor(s, asyncNames))) continue
    findings.push({
      file: rel,
      line: lineOf(text, m.index),
      col: colOf(text, m.index),
      rule: 'R1',
      msg: `裸 .${m[1]}：链头「${anchor ? anchor.join('.') : '?'}」不保证返回 Promise`,
      hint: '改用 toPromise / thenSafe / replySafe，或行尾加 // async-ok 说明',
    })
  }

  // ── R2：异步定时器 ──
  TIMER_RE.lastIndex = 0
  while ((m = TIMER_RE.exec(text))) {
    const prev = text[m.index - 1]
    if (prev === '.' || isIdentChar(prev)) continue
    const raw = srcLines[lineOf(text, m.index) - 1] || ''
    if (raw.includes('async-ok')) continue
    const openIdx = m.index + m[0].length - 1
    // 提示文案从**原始源码**取（sanitize 是等长的，偏移量通用），别让字符串变成空格
    const arg = firstArg(src, openIdx).trim()
    const isAsyncCb = /^async\b/.test(arg) || asyncNames.has(arg)
    if (!isAsyncCb) continue
    findings.push({
      file: rel,
      line: lineOf(text, m.index),
      col: colOf(text, m.index),
      rule: 'R2',
      msg: `${m[1]} 的异步回调没人接：${arg.slice(0, 40)}`,
      hint: '改用 setSafeTimeout（utils/async.js），回调抛错会被记日志而不是 unhandledRejection',
    })
  }
}

if (findings.length === 0) {
  console.log(`✅ 异步体检通过：${files.length} 个文件，无裸 then/catch、无异步定时器\n`)
  process.exit(0)
}

console.log(`❌ 异步体检发现 ${findings.length} 处问题：\n`)
for (const f of findings) {
  console.log(`  ${f.file}:${f.line}:${f.col}  [${f.rule}] ${f.msg}`)
  console.log(`      → ${f.hint}`)
}
console.log('')
process.exit(1)
