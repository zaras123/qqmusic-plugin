/**
 * Generate plugin logo for Guoba (PNG + SVG)
 * QQ Music green disc + white music note
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../resources/img')
fs.mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeB = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
  return Buffer.concat([len, typeB, data, crc])
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const S = 256
const px = Buffer.alloc(S * S * 4)

function set(x, y, r, g, b, a = 255) {
  x = x | 0
  y = y | 0
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  const oa = px[i + 3] / 255
  const na = a / 255
  const outA = na + oa * (1 - na)
  if (outA <= 0) return
  px[i] = Math.round((r * na + px[i] * oa * (1 - na)) / outA)
  px[i + 1] = Math.round((g * na + px[i + 1] * oa * (1 - na)) / outA)
  px[i + 2] = Math.round((b * na + px[i + 2] * oa * (1 - na)) / outA)
  px[i + 3] = Math.round(outA * 255)
}

function fillCircle(cx, cy, rad, r, g, b, a = 255) {
  const r2 = rad * rad
  const x0 = Math.floor(cx - rad - 1)
  const x1 = Math.ceil(cx + rad + 1)
  const y0 = Math.floor(cy - rad - 1)
  const y1 = Math.ceil(cy + rad + 1)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d2 = dx * dx + dy * dy
      if (d2 <= r2) {
        const edge = Math.sqrt(d2)
        let aa = a
        if (edge > rad - 1.2) aa = Math.round(a * Math.max(0, (rad - edge) / 1.2))
        set(x, y, r, g, b, aa)
      }
    }
  }
}

function fillRing(cx, cy, rOut, rIn, r, g, b, a = 255) {
  const x0 = Math.floor(cx - rOut - 1)
  const x1 = Math.ceil(cx + rOut + 1)
  const y0 = Math.floor(cy - rOut - 1)
  const y1 = Math.ceil(cy + rOut + 1)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d <= rOut && d >= rIn) {
        let aa = a
        if (d > rOut - 1.2) aa = Math.round(a * Math.max(0, (rOut - d) / 1.2))
        else if (d < rIn + 1.2) aa = Math.round(a * Math.max(0, (d - rIn) / 1.2))
        set(x, y, r, g, b, aa)
      }
    }
  }
}

function fillRect(x0, y0, w, h, r, g, b, a = 255, radius = 0) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (radius > 0) {
        const lx = x - x0
        const ly = y - y0
        let inside = true
        const rr = radius * radius
        if (lx < radius && ly < radius) {
          const dx = radius - lx - 0.5
          const dy = radius - ly - 0.5
          inside = dx * dx + dy * dy <= rr
        } else if (lx >= w - radius && ly < radius) {
          const dx = lx - (w - radius - 0.5)
          const dy = radius - ly - 0.5
          inside = dx * dx + dy * dy <= rr
        } else if (lx < radius && ly >= h - radius) {
          const dx = radius - lx - 0.5
          const dy = ly - (h - radius - 0.5)
          inside = dx * dx + dy * dy <= rr
        } else if (lx >= w - radius && ly >= h - radius) {
          const dx = lx - (w - radius - 0.5)
          const dy = ly - (h - radius - 0.5)
          inside = dx * dx + dy * dy <= rr
        }
        if (!inside) continue
      }
      set(x, y, r, g, b, a)
    }
  }
}

// Prefer the hand-tuned renderer: re-run is fine; keep file for npm run gen-logo
// (actual drawing is done by the same math as the one-shot cleaner version below)
// soft shadow
fillCircle(S / 2 + 2, S / 2 + 6, 112, 0, 0, 0, 35)
// brand green disc #31c27c family
fillCircle(S / 2, S / 2, 110, 26, 160, 100, 255)
fillCircle(S / 2 - 10, S / 2 - 12, 100, 49, 194, 124, 210)
fillCircle(S / 2 - 14, S / 2 - 18, 70, 90, 220, 150, 90)
// vinyl ring
fillRing(S / 2, S / 2, 100, 94, 255, 255, 255, 50)
fillCircle(S / 2, S / 2, 18, 20, 120, 80, 40)

// white music note
const W = 255
// head (two overlapping circles ~ ellipse)
fillCircle(112, 170, 30, W, W, W, 255)
fillCircle(102, 174, 28, W, W, W, 255)
// stem
fillRect(140, 56, 16, 120, W, W, W, 255, 5)
// flag
for (let i = 0; i < 40; i++) {
  const t = i / 39
  const x = 156 + t * 42
  const y = 56 + 8 * t + 26 * Math.sin(t * Math.PI * 0.9)
  fillCircle(x, y, 8.5 - t * 3.5, W, W, W, 255)
}
for (let t = 0; t <= 1; t += 0.02) {
  for (let s = 0; s <= 1; s += 0.1) {
    const x = 156 + t * 40 + s * 4
    const y = 56 + 8 * t + 20 * Math.sin(t * Math.PI * 0.9) + s * 10
    fillCircle(x, y, 5, W, W, W, 230)
  }
}

// gloss arc
for (let a = -2.4; a < -0.8; a += 0.008) {
  const rr = 90
  const x = S / 2 + Math.cos(a) * rr
  const y = S / 2 + Math.sin(a) * rr - 6
  fillCircle(x, y, 3, 255, 255, 255, 50)
}

const logoPath = path.join(outDir, 'logo.png')
fs.writeFileSync(logoPath, encodePNG(S, S, px))
console.log('wrote', logoPath, fs.statSync(logoPath).size)

// 只产出 logo.png —— 其它尺寸/矢量版（logo-64.png、logo.svg）插件里没有任何地方读，
// 生成了反而是死文件（2026-09-20 清理时删掉了它们，这里同步收口）。
