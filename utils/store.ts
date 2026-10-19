/**
 * 订阅 / 定时点歌的**落盘存储**（`data/qqmusic-store.json`）
 *
 * 为什么不用 Redis（session / pref 都在用）：这两类数据是「**设一次管很久**」的
 * 群级资产 —— 机器人重启、redis 丢了都不该蒸发，也没有过期一说。JSON 文件 +
 * 原子写（tmp + rename）最直接，test.mjs 也能直接读它做断言。
 *
 * 为什么放插件根的 `data/`：`#qqm强制更新` 会 `git clean -fd`，豁免清单里
 * 加了 `-e data`（见 utils/update.js），更新不会把它冲掉。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pluginPath } from './path.js'
import { logWarn } from './log.js'

const FILE = path.join(pluginPath, 'data', 'qqmusic-store.json')

const EMPTY = { version: 1, schedules: [], subs: [], lastSubScanAt: 0 }

/** 兜成合法形状（手改坏 / 旧版本文件都不炸） */
function normalize(data) {
  const d = data && typeof data === 'object' ? data : {}
  return {
    version: 1,
    schedules: Array.isArray(d.schedules) ? d.schedules : [],
    subs: Array.isArray(d.subs) ? d.subs : [],
    lastSubScanAt: Number(d.lastSubScanAt) || 0,
  }
}

export function loadStore() {
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')))
  } catch {
    return { ...EMPTY, schedules: [], subs: [] }
  }
}

/** 原子落盘：先写临时文件再 rename，半路断电也不会留半个 JSON */
export function saveStore(data) {
  const next = normalize(data)
  next.updatedAt = Date.now()
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    const tmp = `${FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
    fs.renameSync(tmp, FILE)
  } catch (err) {
    logWarn(`[qqmusic-plugin] 订阅/定时的存储写不进去（${err.message}）—— 功能这次重启内还能跑，重启后会丢`)
  }
  return next
}

/** 生一个短 id（同一条命令里够用；不需要全局唯一） */
export function newId(prefix = 'j') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
