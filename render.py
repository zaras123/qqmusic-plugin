"""QQ Music cards: shared HTML themes via Chromium, with a Pillow fallback."""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

import aiohttp
from PIL import Image, ImageDraw, ImageFont, ImageOps

from astrbot.api import logger

ROOT = Path(__file__).resolve().parent
FONT = ROOT / "astrbot_assets" / "fonts" / "QQM-CJK-Regular.otf"
THEMES = {
    # Background endpoints, accent and dark accent.
    "classic": ("#d9f7e9", "#eefaf4", "#087756", "#65e5ad"),
    "apple": ("#ffe6eb", "#fff4f7", "#b6255b", "#ff8bb8"),
    "nebula": ("#e4ddff", "#f4efff", "#5942b1", "#b3a0ff"),
    "multi": ("#dce9fe", "#f1f7ff", "#1a5cb1", "#7cbcfa"),
}
WIDTH = 960
HEIGHT_LIMIT = 4800
MEDIA_DOMAINS = ("y.gtimg.cn", "i.gtimg.cn", "p.qpic.cn", "qpic.cn")


def _s(value):
    if value is None:
        return ""
    return str(value).replace("\x00", "")[:600].strip()


def _join(*values):
    return "  ·  ".join(s for value in values if (s := _s(value)))


def _label(key, val):
    return f"{key}：{_s(val)}" if _s(val) else ""


def _dicts(values, limit=35):
    return [value for value in (values or ()) if isinstance(value, dict)][:limit]


@dataclass(frozen=True)
class Row:
    title: str
    detail: str = ""
    badge: str = ""
    section: bool = False


@dataclass
class Card:
    label: str
    title: str
    subtitle: str = ""
    tip: str = ""
    rows: list[Row] = field(default_factory=list)
    cover: str = ""


def _commands(rows, commands):
    commands = _dicts(commands, 8)
    if commands:
        rows.append(Row("常用指令", section=True))
    rows.extend(Row(_s(c.get("name")), _join(c.get("example"), c.get("desc"))) for c in commands)


def describe(kind: str, data: dict) -> Card:
    """Normalize card payloads into bounded text, sections and safe optional cover."""
    kind = kind.removeprefix("qqmusic-")
    if kind == "help":
        card = Card("使用指南", "QQ 音乐", _join(data.get("version"), data.get("statQuality"), data.get("statMode")))
        for section in _dicts(data.get("sections"), 10):
            card.rows.append(Row(_s(section.get("title")), badge=_s(section.get("tag")), section=True))
            card.rows.extend(Row(_s(item.get("name")), _join(item.get("example"), item.get("desc")))
                             for item in _dicts(section.get("items"), 12))
    elif kind == "list":
        card = Card("搜索结果", _s(data.get("keyword")) or "歌曲列表",
                    _join(f"{data.get('total', 0)} 首", data.get("quality")))
        for i, song in enumerate(_dicts(data.get("songs")), start=1):
            card.rows.append(Row(
                _s(song.get("songName")) or "未知曲目",
                _join(song.get("singerName"), song.get("albumName"), song.get("duration"),
                      "需会员" if song.get("payplay") else "", "MV" if song.get("hasMv") else ""),
                f"{i:02d}",
            ))
        _commands(card.rows, data.get("commands"))
    elif kind == "hot":
        card = Card("热搜与推荐", _s(data.get("title")) or "QQ 音乐热搜", _s(data.get("subtitle")))
        for i, item in enumerate(_dicts(data.get("items")), start=1):
            card.rows.append(Row(_s(item.get("word")), _label("热度", item.get("hot")), f"{i:02d}"))
    elif kind in ("detail", "lyric", "poster", "comment"):
        label = {"detail": "曲目详情", "lyric": "歌词", "poster": "歌词海报", "comment": "热门评论"}[kind]
        if kind == "detail" and data.get("source") == "MV":
            label = "MV 详情"
        card = Card(label, _s(data.get("songName")) or "QQ 音乐",
                    _join(data.get("singerName"), data.get("albumName")), cover=_s(data.get("cover")))
        if kind == "detail":
            card.rows = [Row(k, _s(data.get(v))) for k, v in
                         (("来源", "source"), ("时长", "duration"), ("音质", "qualityLabel")) if data.get(v)]
            if data.get("showPay") and data.get("payplay"):
                card.rows.append(Row("播放权限", "该版本可能需要会员"))
        elif kind in ("lyric", "poster"):
            card.rows = [Row(_s(line)) for line in (data.get("lines") or ())[:36] if _s(line)]
        else:
            card.rows = [Row(_s(c.get("nick")) or "匿名", _s(c.get("content")),
                             _join(c.get("time"), f"赞 {c.get('likes')}" if c.get("likes") else "")[:23])
                         for c in _dicts(data.get("comments"), 20)]
    elif kind == "status":
        card = Card("账号与连接", _s(data.get("title")) or "QQ 音乐状态", _s(data.get("subtitle")))
        card.rows = [Row(k, _s(data.get(v))) for k, v in (
            ("昵称", "nickname"), ("QQ 号", "uin"), ("登录方式", "loginTypeText"),
            ("凭据状态", "keyStatus"), ("会员", "vipTitle"), ("会员状态", "vipStateText"),
            ("有效期", "vipExpireText"), ("音质", "musicQuality"), ("API", "apiBase"),
        ) if data.get(v)]
        for state in _dicts(data.get("stats"), 12):
            card.rows.append(Row(_s(state.get("label")), _s(state.get("value"))))
    elif kind == "settings":
        card = Card("插件配置", _s(data.get("title")) or "QQ 音乐设置", _s(data.get("subtitle")))
        card.rows = [Row(_s(r.get("k")), _s(r.get("v"))) for r in _dicts(data.get("rows"), 18)]
        _commands(card.rows, data.get("commands"))
    else:
        card = Card("音乐与演出", _s(data.get("title")) or "QQ 音乐", _s(data.get("subtitle")))
        card.rows = [Row(_s(row)) for row in (data.get("rows") or ())[:30] if _s(row)]
    card.tip = _join(data.get("tip"), data.get("apiHint"))
    return card


def _palette(cfg):
    theme = THEMES.get(cfg.get("uiTheme"), THEMES["classic"])
    mode = cfg.get("uiDark")
    dark = mode == "深色" or (mode == "自动" and not 6 <= datetime.now().hour < 18)
    if dark:
        return "#151e2b", "#243247", theme[3], "#1a2535", "#25334a", "#f6f8ff", "#bac6d9", "#34445c"
    return theme[0], theme[1], theme[2], "#ffffff", "#f5f8fc", "#14263a", "#485b70", "#e3eaf2"


def _font(cfg, size):
    for candidate in (
        str(cfg.get("renderFontPath") or ""), str(FONT),
        r"C:\Windows\Fonts\msyh.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ):
        if not candidate:
            continue
        try:
            return ImageFont.truetype(candidate, size)
        except (OSError, ValueError):
            continue
    raise RuntimeError("没有可用的中文字体")


def _wrap(text, font, width, cap):
    lines = []
    for paragraph in _s(text).splitlines():
        line = ""
        for char in paragraph:
            if line and font.getlength(line + char) > width:
                lines.append(line)
                if len(lines) >= cap:
                    return lines[:-1] + [lines[-1].rstrip()[:-1] + "…"]
                line = char
            else:
                line += char
        lines.append(line)
        if len(lines) >= cap:
            break
    return lines


def _redraw(card, target, cfg, cover):
    start, end, accent, panel, rail, text, subtle, line = _palette(cfg)
    brand, display, main, small = (_font(cfg, s) for s in (17, 47, 24, 18))
    margin = 48
    inner = WIDTH - margin * 2
    art_size = 128 if card.cover else 0
    header_width = inner - 48 - (art_size + 24 if art_size else 0)
    titles = _wrap(card.title, display, header_width, 3) or ["QQ 音乐"]
    subs = _wrap(card.subtitle, main, header_width, 2)
    header_height = max(188 if art_size else 148, 90 + len(titles) * 62 + len(subs) * 32)
    tip = _wrap(card.tip, small, inner - 44, 4)
    available = HEIGHT_LIMIT - 185 - header_height - len(tip) * 26
    planned = []
    for row in card.rows[:80]:
        tag = _wrap(row.badge, brand, 180, 1)
        space = inner - 54 - (int(brand.getlength(tag[0])) + 56 if tag else 0)
        top_lines = _wrap(row.title, main, space, 3)
        bottom_lines = _wrap(row.detail, small, space, 4)
        height = 21 + 32 * len(top_lines) + 27 * len(bottom_lines) + (6 if bottom_lines else 0)
        if height + 7 > available:
            tip = ["内容较长，更多内容可用对应文字指令查看。", *tip[:2]]
            break
        planned.append((row, tag, top_lines, bottom_lines, height))
        available -= height + 7
    height = 114 + header_height + sum(entry[-1] + 7 for entry in planned) + (len(tip) * 26 + 19 if tip else 0)
    canvas = Image.new("RGB", (WIDTH, height), panel)
    draw = ImageDraw.Draw(canvas)
    rgb_a = tuple(int(start[i:i+2], 16) for i in (1, 3, 5))
    rgb_b = tuple(int(end[i:i+2], 16) for i in (1, 3, 5))
    for y in range(height):
        draw.line((0, y, WIDTH, y), fill=tuple(a + (b - a) * y // height for a, b in zip(rgb_a, rgb_b)))
    draw.rounded_rectangle((24, 24, WIDTH - 24, height - 24), radius=28, fill=panel, outline=line, width=2)
    draw.rounded_rectangle((margin, 44, margin + 44, 88), radius=12, fill=accent)
    try:
        with Image.open(ROOT / "logo.png") as origin:
            logo = ImageOps.contain(origin.convert("RGBA"), (38, 38))
            canvas.paste(logo, (margin + 3, 47), logo)
    except OSError:
        pass
    draw.text((margin + 62, 54), "QQ MUSIC  /  ASTRBOT", font=brand, fill=accent, anchor="lt")
    draw.line((margin, 101, WIDTH - margin, 101), fill=line, width=2)
    draw.text((margin, 120), card.label, font=small, fill=accent, anchor="lt")
    cursor = 157
    for title in titles:
        draw.text((margin, cursor), title, font=display, fill=text, anchor="lt")
        cursor += 62
    for subtitle in subs:
        draw.text((margin, cursor), subtitle, font=main, fill=subtle, anchor="lt")
        cursor += 32
    if art_size:
        x = WIDTH - margin - art_size
        mask = Image.new("L", (art_size, art_size))
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, art_size - 1, art_size - 1), radius=18, fill=255)
        if cover:
            canvas.paste(ImageOps.fit(cover, (art_size, art_size)), (x, 119), mask)
        else:
            draw.rounded_rectangle((x, 119, x + art_size, 119 + art_size), fill=rail, radius=18)
            draw.ellipse((x + 42, 183, x + 65, 203), fill=accent)
            draw.line((x + 63, 190, x + 63, 151, x + 84, 145), width=5, fill=accent)
    cursor = 75 + header_height
    for row, tag, tops, bottoms, row_h in planned:
        if not row.section:
            draw.rounded_rectangle((margin, cursor, WIDTH - margin, cursor + row_h), radius=13, fill=rail)
        if tag:
            right = WIDTH - margin - 14
            tw = int(brand.getlength(tag[0])) + 22
            draw.rounded_rectangle((right - tw, cursor + 10, right, cursor + 37), radius=8, outline=accent, width=1)
            draw.text((right - 11, cursor + 13), tag[0], font=brand, fill=accent, anchor="rt")
        y = cursor + 12
        for t in tops:
            draw.text((margin + 14, y), t, font=main, fill=accent if row.section else text, anchor="lt")
            y += 32
        for t in bottoms:
            draw.text((margin + 14, y), t, font=small, fill=subtle, anchor="lt")
            y += 27
        cursor += row_h + 7
    for t in tip:
        draw.text((margin + 8, cursor + 3), t, font=small, fill=subtle, anchor="lt")
        cursor += 26
    path = Path(target)
    options = {"format": "PNG", "compress_level": 4} if path.suffix.lower() == ".png" else {
        "format": "JPEG", "quality": 89, "optimize": True,
    }
    canvas.save(path, **options)


async def _artwork(raw: str):
    """Fetch one public artwork only when opted in; don't forward tokens/redirects."""
    try:
        url = urlsplit(raw)
        host = url.hostname or ""
        if url.scheme != "https" or url.port or url.username or url.password or url.query or not any(
            host == suffix or host.endswith("." + suffix) for suffix in MEDIA_DOMAINS
        ):
            return None
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2.5)) as client:
            async with client.get(url.geturl(), allow_redirects=False) as res:
                if res.status != 200 or res.content_type not in {"image/jpeg", "image/png", "image/webp"}:
                    return None
                parts = bytearray()
                async for chunk in res.content.iter_chunked(65536):
                    parts.extend(chunk)
                    if len(parts) > 2_000_000:
                        return None
        return await asyncio.to_thread(_decode_cover, parts)
    except (aiohttp.ClientError, OSError, ValueError, TimeoutError, Image.DecompressionBombError):
        return None


def _decode_cover(payload):
    with Image.open(BytesIO(payload), formats=("JPEG", "PNG", "WEBP")) as image:
        if image.width * image.height > 4_000_000:
            return None
        image.thumbnail((384, 384))
        return image.convert("RGB")


# ══════════════════ HTML 主题渲染（与 Yunzai/Karin 完全同源） ══════════════════
#
# 三端共用同一套 resources/themes/<id>/*.html + _base.css。AstrBot 端不再用
# Pillow 重画一套“相似但不一样”的卡片，而是把同一份 art-template 模板交给
# 无头 Chromium 渲染，再按 Yunzai 的同一组参数截图：640/660 视口、3x DPR
# （超过像素预算降 2x）、.page 元素截图、不透明主题底色、JPEG q92。
#
# Pillow 渲染器保留为降级路径：没有 Playwright / Chromium / 系统库时仍能出图。

RESOURCES = ROOT / "resources"
THEMES_DIR = RESOURCES / "themes"
ART_RUNTIME = RESOURCES / "vendor" / "art-template-web.js"
DEFAULT_THEME = "classic"
CARD_PIXEL_BUDGET = 8_000_000
IMAGE_QUALITY = 92
_CHROME_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--font-render-hinting=none",
    "--enable-font-antialiasing",
    "--hide-scrollbars",
]

_THEME_ALIASES = {
    "经典": "classic",
    "classic": "classic",
    "apple": "apple",
    "apple 风": "apple",
    "苹果": "apple",
    "nebula": "nebula",
    "星云": "nebula",
    "multi": "multi",
    "多平台": "multi",
}

_manifest_cache: dict[str, tuple[float, dict]] = {}


def _load_manifest(theme_id: str) -> dict:
    path = THEMES_DIR / theme_id / "theme.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    cached = _manifest_cache.get(theme_id)
    if cached and cached[0] == mtime:
        return cached[1]
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            manifest = {}
    except (OSError, ValueError):
        manifest = {}
    _manifest_cache[theme_id] = (mtime, manifest)
    return manifest


def _time_period(dt: datetime | None = None) -> str:
    hour = (dt or datetime.now()).hour
    if 5 <= hour < 8:
        return "dawn"
    if 8 <= hour < 17:
        return "day"
    if 17 <= hour < 20:
        return "dusk"
    return "night"


def _dark_pref(value) -> str:
    if value is True:
        return "dark"
    if value is False or value is None or value == "":
        return "light"
    text = str(value).strip().lower()
    if text in {"auto", "time", "自动"}:
        return "auto"
    if text in {"true", "1", "yes", "on", "dark", "深色"}:
        return "dark"
    return "light"


@dataclass(frozen=True)
class Theme:
    id: str
    manifest: dict
    dark: bool
    period: str

    @property
    def page_bg(self) -> str:
        page_bg = self.manifest.get("pageBg")
        if not isinstance(page_bg, dict):
            page_bg = {}
        mode = "dark" if self.dark else "light"
        return str(page_bg.get(mode) or page_bg.get("light") or "#F2F2F7")

    @property
    def viewport_width(self) -> int:
        try:
            width = int(self.manifest.get("viewportWidth") or 640)
        except (TypeError, ValueError):
            width = 640
        return width if width > 0 else 640


def resolve_theme(cfg: dict | None = None) -> Theme:
    cfg = cfg or {}
    requested = str(cfg.get("uiTheme") or "").strip()
    theme_id = _THEME_ALIASES.get(requested.lower(), _THEME_ALIASES.get(requested, ""))
    if not theme_id or not (THEMES_DIR / theme_id / "theme.json").is_file():
        theme_id = DEFAULT_THEME
    manifest = _load_manifest(theme_id)
    period = "day" if cfg.get("uiTimeColor") is False else _time_period()
    pref = _dark_pref(cfg.get("uiDark"))
    dark = manifest.get("dark") is True and (
        pref == "dark" or (pref == "auto" and period == "night")
    )
    return Theme(theme_id, manifest, dark, period)


def _rewrite_resources(html: str, res_url: str) -> str:
    html = re.sub(r'(src|href)="(?:\./)?resources/', rf'\1="{res_url}', html)
    html = re.sub(r'url\((["\'])?(?:\./)?resources/', rf"url(\1{res_url}", html)
    return html


_SET_BACKGROUND_JS = """(bg) => {
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.documentElement.style.width = 'fit-content';
    document.body.style.width = 'fit-content';
    document.documentElement.style.margin = '0';
    document.body.style.margin = '0';
}"""

_WAIT_ASSETS_JS = """async () => {
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) {}
    const images = Array.from(document.images || []);
    const pending = images.map((img) => (
        img.complete ? Promise.resolve() : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        })
    ));
    await Promise.race([
        Promise.all(pending),
        new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
}"""

_WAIT_FRAMES_JS = """([count, timeout]) => new Promise((resolve) => {
    let done = false;
    let left = count;
    const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(1);
    };
    const timer = setTimeout(finish, timeout);
    const tick = () => {
        left -= 1;
        if (left <= 0) finish();
        else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""


async def _wait_frames(page, count: int = 2, timeout_ms: int = 1000) -> None:
    await page.evaluate(_WAIT_FRAMES_JS, [count, timeout_ms])


class _BrowserHost:
    """常驻 Chromium；浏览器/依赖不可用时短路，后续直接走 Pillow。"""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._playwright = None
        self._browser = None
        self._failed = False
        self._hint_logged = False

    @staticmethod
    def _launch_options() -> list[dict]:
        options: list[dict] = []
        env = os.environ.get("QQMUSIC_CHROME_PATH") or os.environ.get("CHROME_PATH")
        if env:
            options.append({"executable_path": env})
        for candidate in (
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
        ):
            if os.path.isfile(candidate):
                options.append({"executable_path": candidate})
        options.extend([{"channel": "chrome"}, {"channel": "msedge"}, {}])
        return options

    def _hint(self, reason: str) -> None:
        if self._hint_logged:
            logger.warning(f"[qqmusic] 卡片浏览器渲染不可用（{reason}），已回退 Pillow")
            return
        self._hint_logged = True
        logger.error(
            "[qqmusic] 卡片浏览器渲染不可用（%s）。卡片已回退 Pillow。\n"
            "如需与 Yunzai/Karin 完全一致的主题卡片，请安装：\n"
            "  pip install playwright\n"
            "  python -m playwright install chromium\n"
            "（已有系统 Chrome/Edge 时可不下载 Chromium）",
            reason,
        )

    async def get(self):
        if self._browser is not None:
            return self._browser
        if self._failed:
            return None
        async with self._lock:
            if self._browser is not None:
                return self._browser
            if self._failed:
                return None
            try:
                from playwright.async_api import async_playwright
            except Exception as exc:  # noqa: BLE001
                self._failed = True
                self._hint(f"缺少依赖 {exc}")
                return None
            playwright = None
            try:
                playwright = await async_playwright().start()
                last_error = None
                for kwargs in self._launch_options():
                    try:
                        browser = await playwright.chromium.launch(
                            headless=True, args=_CHROME_ARGS, **kwargs
                        )
                    except Exception as exc:  # noqa: BLE001
                        last_error = exc
                        continue
                    self._playwright = playwright
                    self._browser = browser
                    logger.info(
                        "[qqmusic] 卡片渲染已启用 Chromium（主题模板与 Yunzai/Karin 同源）"
                    )
                    return browser
                self._failed = True
                self._hint(f"无法启动 Chromium：{last_error}")
                try:
                    await playwright.stop()
                except Exception:  # noqa: BLE001
                    pass
                return None
            except Exception as exc:  # noqa: BLE001
                self._failed = True
                self._hint(f"Playwright 启动失败：{exc}")
                if playwright is not None:
                    try:
                        await playwright.stop()
                    except Exception:  # noqa: BLE001
                        pass
                return None

    async def close(self) -> None:
        browser, playwright = self._browser, self._playwright
        self._browser = None
        self._playwright = None
        if browser is not None:
            try:
                await browser.close()
            except Exception:  # noqa: BLE001
                pass
        if playwright is not None:
            try:
                await playwright.stop()
            except Exception:  # noqa: BLE001
                pass
        self._failed = False
        self._hint_logged = False


class Renderer:
    def __init__(self):
        self._limit = asyncio.Semaphore(2)
        self._active = set()
        self._closed = False
        self._host = _BrowserHost()
        self._fallback_logged = False

    async def render(self, kind, data, target, cfg):
        async with self._limit:
            if self._closed:
                raise RuntimeError("绘图组件已关闭")
            cfg = cfg or {}
            target = Path(target)
            engine = str(cfg.get("renderEngine") or "html").strip().lower()
            if engine != "pillow":
                job = asyncio.create_task(
                    self._render_html(kind, data, str(target), cfg)
                )
                self._active.add(job)
                job.add_done_callback(self._active.discard)
                try:
                    if await asyncio.shield(job):
                        return
                except asyncio.CancelledError:
                    await asyncio.gather(job, return_exceptions=True)
                    target.unlink(missing_ok=True)
                    raise
                except Exception as exc:  # noqa: BLE001
                    if not self._fallback_logged:
                        self._fallback_logged = True
                        logger.warning(
                            f"[qqmusic] HTML 卡片渲染失败（{type(exc).__name__}: {exc}），回退 Pillow"
                        )
                if not target.exists() and not self._fallback_logged:
                    self._fallback_logged = True
                    logger.warning("[qqmusic] HTML 卡片渲染未产出文件，回退 Pillow")

            card = describe(kind, data)
            job = asyncio.create_task(self._render_pillow(card, str(target), cfg))
            self._active.add(job)
            job.add_done_callback(self._active.discard)
            try:
                await asyncio.shield(job)
            except asyncio.CancelledError:
                await asyncio.gather(job, return_exceptions=True)
                target.unlink(missing_ok=True)
                raise

    async def _render_pillow(self, card, target, cfg):
        cover = (
            await _artwork(card.cover)
            if card.cover and cfg.get("renderCover", False)
            else None
        )
        await asyncio.to_thread(_redraw, card, target, cfg, cover)

    # ────────── Chromium 截图主路径 ──────────

    async def _render_html(self, kind, data, target: str, cfg: dict) -> bool:
        browser = await self._host.get()
        if browser is None:
            return False
        card = kind if kind.startswith("qqmusic-") else f"qqmusic-{kind}"
        theme = resolve_theme(cfg)
        tpl_path = THEMES_DIR / theme.id / f"{card}.html"
        if not tpl_path.is_file():
            tpl_path = THEMES_DIR / DEFAULT_THEME / f"{card}.html"
        if not tpl_path.is_file():
            return False
        if not ART_RUNTIME.is_file():
            logger.warning("[qqmusic] 缺少 resources/vendor/art-template-web.js")
            return False
        try:
            source = tpl_path.read_text(encoding="utf-8")
            runtime = ART_RUNTIME.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning(f"[qqmusic] 读取卡片模板失败: {exc}")
            return False
        res_url = RESOURCES.as_uri().rstrip("/") + "/"
        try:
            box = await self._capture(
                browser, 3, tpl_path, source, runtime, data, theme, res_url, target
            )
            if box and box[0] * box[1] * 9 > CARD_PIXEL_BUDGET:
                # 与 Yunzai 的 deviceScaleFor() 同口径：长卡降到 2x，控制图片体积。
                box = await self._capture(
                    browser, 2, tpl_path, source, runtime, data, theme, res_url, target
                )
            return bool(box) and Path(target).is_file()
        except Exception as exc:  # noqa: BLE001
            Path(target).unlink(missing_ok=True)
            raise

    async def _capture(
        self,
        browser,
        dpr: int,
        tpl_path: Path,
        source: str,
        runtime: str,
        data: dict,
        theme: Theme,
        res_url: str,
        target: str,
    ):
        width = theme.viewport_width
        context = await browser.new_context(
            viewport={"width": width, "height": 2200},
            device_scale_factor=dpr,
            color_scheme="dark" if theme.dark else "light",
        )
        page = await context.new_page()
        try:
            await page.goto(tpl_path.as_uri(), wait_until="load", timeout=60000)
            await page.add_script_tag(content=runtime)
            html = await page.evaluate(
                "([source, data]) => template.render(source, {data})", [source, data]
            )
            if not isinstance(html, str) or not html.strip():
                raise RuntimeError("模板渲染结果为空")
            html = _rewrite_resources(html, res_url)
            html = re.sub(
                r"<html\b",
                '<html data-theme="%s" data-mode="%s" data-time="%s"' % (
                    theme.id,
                    "dark" if theme.dark else "light",
                    theme.period,
                ),
                html,
                count=1,
                flags=re.IGNORECASE,
            )
            await page.evaluate(
                "(html) => {document.open();document.write(html);document.close();}",
                html,
            )
            await page.evaluate(_SET_BACKGROUND_JS, theme.page_bg)
            await page.evaluate(_WAIT_ASSETS_JS)
            await _wait_frames(page)

            element = (
                await page.query_selector(".page")
                or await page.query_selector(".card")
                or await page.query_selector("body")
            )
            if element is None:
                raise RuntimeError("模板里没有可截图的元素")
            box = await element.bounding_box()
            if not box:
                raise RuntimeError("卡片尺寸为 0")
            need_w = math.ceil(box["x"] + box["width"] + 4)
            need_h = math.ceil(box["y"] + box["height"] + 4)
            if need_w > width or need_h > 2200:
                await page.set_viewport_size(
                    {"width": max(width, need_w), "height": max(2200, need_h)}
                )
                await _wait_frames(page)
                element = (
                    await page.query_selector(".page")
                    or await page.query_selector(".card")
                    or await page.query_selector("body")
                )
                box = await element.bounding_box() if element else None
                if not box:
                    raise RuntimeError("调整视口后卡片尺寸为 0")

            suffix = Path(target).suffix.lower()
            if suffix == ".png":
                await element.screenshot(
                    path=target, type="png", omit_background=False
                )
            else:
                await element.screenshot(
                    path=target,
                    type="jpeg",
                    quality=IMAGE_QUALITY,
                    omit_background=False,
                )
            return (box["width"], box["height"])
        finally:
            try:
                await context.close()
            except Exception:  # noqa: BLE001
                pass

    async def close(self):
        self._closed = True
        await asyncio.gather(*self._active, return_exceptions=True)
        await self._host.close()
