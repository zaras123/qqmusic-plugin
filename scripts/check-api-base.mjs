import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { normalizeApiBase } = await import(pathToFileURL(path.resolve(root, 'dist/utils/api.js')).href)
const cases = [
  ['qqmusic.zvmiy.top', 'https://qqmusic.zvmiy.top'],
  ['qqmusic.zvmiy.top:8443/api/', 'https://qqmusic.zvmiy.top:8443/api'],
  ['api.example.com/v1/', 'https://api.example.com/v1'],
  ['//qqmusic.zvmiy.top/api/', 'https://qqmusic.zvmiy.top/api'],
  ['https://qqmusic.zvmiy.top/', 'https://qqmusic.zvmiy.top'],
  ['http://api.example.com/', 'http://api.example.com'],
  ['localhost:3300/', 'http://localhost:3300'],
  ['LOCALHOST:3300', 'http://LOCALHOST:3300'],
  ['127.0.0.1:3300', 'http://127.0.0.1:3300'],
  ['192.168.1.20:3300/api/', 'http://192.168.1.20:3300/api'],
  ['[::1]:3300/', 'http://[::1]:3300'],
  ['https://127.0.0.1:3300', 'https://127.0.0.1:3300'],
  ['localhost.example.com', 'https://localhost.example.com'],
  ['127.0.0.1.example.com', 'https://127.0.0.1.example.com'],
  ['https：//api.example.com/', 'https://api.example.com'],
  ['\u200bqqmusic.zvmiy.top\ufeff', 'https://qqmusic.zvmiy.top'],
  ['  qqmusic.zvmiy.top  ', 'https://qqmusic.zvmiy.top'],
  ['"qqmusic.zvmiy.top"', 'https://qqmusic.zvmiy.top'],
  ['ws://localhost:3300/', 'ws://localhost:3300'],
  ['', ''],
  [undefined, ''],
]
let failed = 0
for (const [input, expected] of cases) {
  try {
    assert.equal(normalizeApiBase(input), expected)
    assert.equal(normalizeApiBase(expected), expected)
  } catch (err) {
    failed++
    console.error(`FAIL ${JSON.stringify(input)}: ${err.message}`)
  }
}
console.log(`API address normalization: ${cases.length - failed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
