/**
 * 静态检查：处理函数引用了「别的处理函数里声明的变量」
 *
 * 起因：给 #qqm登录微信 改文案时，变量 codes 被误用到 startQrLogin（那里没声明），
 * 用户扫码后才报 `codes is not defined`。路由测试只看正则、冒烟测试走不到那段，
 * 所以补这个检查。
 *
 * 用法：node scripts/check-scope.mjs [apps 目录]
 * 退出码：0 无问题 / 1 发现问题
 */
import fs from 'node:fs'
import path from 'node:path'

const appsDir = process.argv[2] || path.join(import.meta.dirname, '..', 'apps')

/** 从一个处理函数体里收集它声明的局部变量名 */
function collectDeclared(body) {
  const out = new Set()
  for (const m of body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1])
  // 解构：const { a, b } = x / const [a, b] = y
  for (const m of body.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]+)[}\]]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().trim().replace(/[=.\s].*$/, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name)
    }
  }
  return out
}

/**
 * 剥离字符串与注释（单次状态机扫描）。
 * 注意：不能用「正则先删行注释再删字符串」—— 代码里的 'https://…' 会让 // 被当成注释起点，
 * 把该行后半段（含收尾引号）一起吃掉，引号配对随之错位，后续内容被整块吞掉。
 */
function stripStringsAndComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && c2 === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      i++
      while (i < n) {
        if (src[i] === '\\') {
          i += 2
          continue
        }
        if (src[i] === q) {
          i++
          break
        }
        i++
      }
      out += q + q
      continue
    }
    out += c
    i++
  }
  return out
}

/** 该标识符在函数体里是否被「裸引用」（排除 obj.name / ?.name / name:（对象键）） */
function usedBare(body, name) {
  const src = stripStringsAndComments(body)
  // 后面不能跟 : —— 那是对象字面量的键（如 { type: 'x' }），不是变量引用
  const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$:])`, 'g')
  for (const m of src.matchAll(re)) {
    const before = src.slice(Math.max(0, m.index - 12), m.index)
    // 排除对象属性、可选链
    if (/[.?]$/.test(before.trimEnd())) continue
    return true
  }
  return false
}

const problems = []
for (const file of fs.readdirSync(appsDir).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(appsDir, file), 'utf8')
  // 收集全文件出现过的「参数名」（含箭头函数、方法、catch）——这些名字天然是局部绑定，
  // 无论哪个函数用都不算误用（否则 type/data/card 这类会误报一片）
  const paramNames = new Set()
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const p of m[1].split(',')) {
      const name = p.split(':').pop().trim().replace(/[=.\s].*$/, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) paramNames.add(name)
    }
  }
  for (const m of src.matchAll(/(?:^|[\s(,])([A-Za-z_$][\w$]*)\s*=>/g)) paramNames.add(m[1])
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) paramNames.add(m[1])

  // 粗切：以两空格缩进的 async fnc(e) { 开头，到同样缩进的 } 结束
  const fns = [...src.matchAll(/^ {2}async ([A-Za-z_$][\w$]*)\(e\) \{([\s\S]*?)^ {2}\}/gm)]
  if (!fns.length) continue

  const declaredBy = new Map()
  for (const [, name, body] of fns) declaredBy.set(name, collectDeclared(body))

  // 变量 → 声明它的函数；只保留「只有一个处理函数声明过」且「从未作为参数出现」的名字。
  // 像 n / type / data / title 这种常见局部名不可能误用，一律跳过（否则误报几十条）。
  const ownerCount = new Map()
  for (const set of declaredBy.values()) {
    for (const v of set) ownerCount.set(v, (ownerCount.get(v) || 0) + 1)
  }
  const owner = new Map()
  for (const [fn, set] of declaredBy) {
    for (const v of set) {
      if (ownerCount.get(v) === 1 && !paramNames.has(v)) owner.set(v, fn)
    }
  }

  for (const [, name, body] of fns) {
    const mine = declaredBy.get(name)
    for (const [v, ownerFn] of owner) {
      if (mine.has(v) || ownerFn === name) continue
      if (usedBare(body, v)) problems.push(`${file} ${name}() 引用了 ${ownerFn}() 里的变量 ${v}`)
    }
  }
}

if (problems.length) {
  console.log('❌ 处理函数变量作用域问题：')
  for (const p of problems) console.log('   ' + p)
  process.exit(1)
}
console.log('✅ 处理函数变量作用域检查通过')
