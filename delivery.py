from __future__ import annotations

import asyncio
import os
import re
import shutil
from urllib.parse import urljoin, urlsplit
from uuid import uuid4
from pathlib import Path

import aiohttp
from astrbot.api.message_components import File, Record

from . import api as qqapi
from .quality import QUALITY_LABEL
from .astrbot_transport import onebot, supports
from .features import safe_page

FFPROBE = shutil.which("ffprobe")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


_PASSIVE_LIMITED = {"qq_official", "qq_official_webhook", "weixin_official_account"}


def _is_passive_limited(event) -> bool:
    return event.get_platform_name() in _PASSIVE_LIMITED


def get_temp_dir(cfg: dict, plugin_dir: str) -> str:
    d = str(cfg.get("tempDir") or "temp/qqmusic")
    p = Path(d)
    if not p.is_absolute():
        p = Path(cfg.get("_data_dir") or plugin_dir) / p
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


def _clean_track_text(s: str, max_len: int = 40) -> str:
    if not s:
        return ""
    s = str(s)
    s = s.replace("【", "(").replace("】", ")").replace("《", "(").replace("》", ")")
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > max_len:
        s = s[:max_len]
    return re.sub(r'[\\/:*?"<>|]', "", s).strip()


def build_music_filename(*, singer: str, title: str, ext: str = "") -> str:
    s = _clean_track_text(singer, 30)
    t = _clean_track_text(title, 40)
    base = f"{s}-{t}" if (s and t) else (s or t or "QQMusic")
    return f"{base}{ext}"


def _audio_ext(head: bytes) -> str:
    if head.startswith(b"fLaC"):
        return ".flac"
    if head.startswith(b"MAC "):
        return ".ape"
    if head.startswith(b"OggS"):
        return ".ogg"
    if head.startswith(b"RIFF") and head[8:12] == b"WAVE":
        return ".wav"
    if head[4:8] == b"ftyp":
        return ".m4a"
    # FLAC 可能带 ID3v2 标签，fLaC 标记在标签之后；只看前 32 字节会误判成 mp3，
    # 进而把 FLAC 当 mp3 交给语音组件，触发 invalid sync code / invalid frame header。
    if head.startswith(b"ID3") and len(head) >= 10:
        size = (
            ((head[6] & 0x7F) << 21)
            | ((head[7] & 0x7F) << 14)
            | ((head[8] & 0x7F) << 7)
            | (head[9] & 0x7F)
        )
        start = 10 + size
        if head[start : start + 4] == b"fLaC":
            return ".flac"
        if head[start : start + 4] == b"MAC ":
            return ".ape"
    if b"fLaC" in head[:4096]:
        return ".flac"
    if head.startswith(b"ID3") or (
        len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0
    ):
        return ".mp3"
    return ""


def _ext_for_quality(quality_hint: str, url: str) -> str:
    q = (quality_hint or "").lower()
    if q == "video":
        return ".mp4"
    if q in ("flac", "hires", "master", "atmos", "atmos_master", "ape"):
        return ".flac" if q != "ape" else ".ape"
    if q in ("m4a",):
        return ".m4a"
    u = (url or "").lower()
    # 与 JS send.js 对齐：显式扩展名优先，再按前缀推断
    for ext in (".ape", ".ogg", ".flac", ".m4a", ".mp3"):
        if ext in u:
            return ext
    if re.search(r"f000|rs01|rs02|q000", u):
        return ".flac"
    if re.search(r"a000|ape", u):
        return ".ape"
    if re.search(r"c400|m4a", u):
        return ".m4a"
    if re.search(r"m800|m500|mp3", u):
        return ".mp3"
    return ".mp3"


async def download_audio(
    url: str, save_dir: str, filename: str = "qqmusic",
    timeout_ms: int = 90000, quality_hint: str = "", user_key: str = "",
) -> dict:
    base = qqapi._get_base()
    url = urljoin(base.rstrip("/") + "/", url)
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError("无效的媒体 URL")
    headers = {"User-Agent": UA, "Referer": "https://y.qq.com/", "Accept-Encoding": "identity"}
    origin = urlsplit(base)
    authenticated = (parsed.scheme, parsed.netloc) == (origin.scheme, origin.netloc) and parsed.path.rsplit("/", 1)[-1] in {"file", "download"}
    if authenticated:
        token = qqapi._get_token()
        if token:
            headers["x-api-token"] = token
            headers["Authorization"] = f"Bearer {token}"
        if user_key:
            headers["x-qqmusic-user"] = qqapi._sanitize_for_header(user_key)
    save = Path(save_dir)
    name = re.sub(r"[^\w.-]", "", filename) or "qqmusic"
    out = save / f"{name}_{uuid4().hex}.part"
    timeout = aiohttp.ClientTimeout(total=timeout_ms / 1000)
    max_size = 150 * 1024 * 1024
    size = 0
    try:
        async with aiohttp.ClientSession(timeout=timeout) as sess:
            async with sess.get(url, headers=headers, allow_redirects=not authenticated) as res:
                if res.status not in (200, 206):
                    raise RuntimeError(f"下载失败 HTTP {res.status}")
                expected = res.content_length
                if (expected or 0) > max_size:
                    raise RuntimeError("媒体文件超过 150 MB")
                head = await res.content.read(4096)
                if not head:
                    raise RuntimeError("下载内容为空")
                if quality_hint == "video":
                    ext = ".mp4" if head[4:8] == b"ftyp" else ""
                else:
                    ext = _audio_ext(head)
                if not ext:
                    raise RuntimeError("下载内容不是已识别的媒体格式")
                with out.open("wb") as fh:
                    fh.write(head)
                    size = len(head)
                    async for data in res.content.iter_chunked(256 * 1024):
                        size += len(data)
                        if size > max_size:
                            raise RuntimeError("媒体文件超过 150 MB")
                        fh.write(data)
        if size < 256:
            raise RuntimeError("下载内容过小")
        if expected and expected > 0 and size < expected:
            raise RuntimeError("下载不完整")
        target = out.with_suffix(ext)
        out.replace(target)
        return {"filePath": str(target), "size": size}
    finally:
        out.unlink(missing_ok=True)


async def _ffmpeg_mp3(path: str, limit: int | None = None) -> str:
    output = str(Path(path).with_name(Path(path).stem + "_voice.mp3"))
    args = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", path, "-vn"]
    if limit:
        args += ["-t", str(limit)]
    process = await asyncio.create_subprocess_exec(
        *args, "-c:a", "libmp3lame", "-b:a", "128k", output,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        if await asyncio.wait_for(process.wait(), timeout=45) != 0 or Path(output).stat().st_size < 256:
            raise RuntimeError("音频转码失败")
    except BaseException:
        if process.returncode is None:
            process.kill()
            await process.wait()
        Path(output).unlink(missing_ok=True)
        raise
    return output


async def _probe_codec(path: str) -> str:
    if not FFPROBE:
        return "unknown"
    try:
        process = await asyncio.create_subprocess_exec(
            FFPROBE,
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "csv=p=0",
            path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(process.communicate(), timeout=15)
        return out.decode("utf-8", "ignore").strip() if process.returncode == 0 else ""
    except Exception:
        return ""


async def _audio_ok(path: str) -> bool:
    # 没有 ffprobe 时不做拦截，避免把正常文件误判成损坏。
    if not FFPROBE:
        return True
    return bool(await _probe_codec(path))


def _schedule_cleanup(file_path: str, keep_sec: int):
    delay = max(0, keep_sec)
    loop = asyncio.get_event_loop()

    def _rm():
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass

    loop.call_later(delay, _rm)


def _write_bytes(path: str, data: bytes):
    Path(path).write_bytes(data)


async def send_native_music_card(event, platform_type: str, music_id: str) -> bool:
    return await _music_card(event, {"type": platform_type, "id": str(music_id)})


async def _music_card(event, data: dict) -> bool:
    if not supports(event, "music") or not hasattr(event, "get_group_id"):
        return False
    try:
        action = "send_group_msg" if event.get_group_id() else "send_private_msg"
        result = await onebot(event, action, {"message": [{"type": "music", "data": data}]})
        return not isinstance(result, dict) or result.get("retcode", 0) in (0, "0")
    except Exception:
        return False


async def send_custom_music_card(event, *, url, audio, title, image="", content="") -> bool:
    # Never expose a private/authenticated stream in a native card payload.
    stream = urlsplit(audio or "")
    if stream.scheme != "https" or not stream.hostname or not any(
        stream.hostname == d or stream.hostname.endswith("." + d) for d in ("qq.com", "gtimg.cn", "qqmusic.qq.com")
    ):
        return False
    if stream.username or stream.password or stream.query:
        return False
    return await _music_card(event, {"type": "custom", "url": url, "audio": audio,
                                     "title": title, "image": image, "content": content})


async def deliver_song(plugin, event, song, play, *, cfg, plugin_dir, options=None) -> dict:
    options = options or {}
    title, singer = song.get("songName") or "未知歌曲", song.get("singerName") or "未知歌手"
    platform = event.get_platform_name()
    preview = options.get("preview", False)
    media = play.get("raw") if isinstance(play.get("raw"), dict) else play
    source = song.get("source") or "qq"
    user_key = play.get("userKey") or plugin._user_key(event)
    if source != "apple" and cfg.get("forceMasterAccount", True):
        user_key = cfg.get("publicAccount") or cfg.get("lastLoginUserKey") or user_key
    mid = str(song.get("songmid") or "")
    page = safe_page(song.get("pageUrl"))
    if not page and source == "qq" and re.fullmatch(r"[A-Za-z0-9]+", mid):
        page = f"https://y.qq.com/n/ryqq/songDetail/{mid}"
    text = f"{'试听 · ' if preview else ''}{title} - {singer}"
    label = play.get("qualityLabel") or QUALITY_LABEL.get(play.get("quality")) or play.get("quality")
    if label and not preview:
        text += f" · {label}"
    text = text if cfg.get("sendTextInfo", True) and not options.get("skipTextInfo") else ""
    url = play.get("url")
    card_ok = False
    if not preview and not media.get("local") and source == "qq" and cfg.get("sendNativeCard") and not options.get("skipNativeCard") and song.get("songid"):
        card_ok = await send_native_music_card(event, "qq", song["songid"])
    if not card_ok and not preview and not media.get("local") and page and url and cfg.get("sendCustomCard") and not options.get("skipCustomCard"):
        card_ok = await send_custom_music_card(event, url=page, audio=url, title=title, image=song.get("cover", ""), content=singer)
    if not url:
        if text:
            await plugin._reply(event, text + "\n未获取到播放链接")
        return {"ok": card_ok, "reason": "no_url"}
    want_voice = cfg.get("sendVocal", True) and supports(event, "record")
    want_file = cfg.get("uploadFile", True) and supports(event, "file")
    if not (want_voice or want_file):
        if not card_ok:
            await plugin._reply(event, "\n".join(x for x in [text, "此会话无法发送音频。", page] if x))
        return {"ok": card_ok, "reason": "no_media"}
    files = set()
    sent = False
    try:
        async def fetch_audio(candidate, quality):
            return await download_audio(
                candidate, get_temp_dir(cfg, plugin_dir), "preview" if preview else "qqmusic",
                int(cfg.get("downloadTimeout") or 90000), str(quality or ""), user_key,
            )

        try:
            dl = await fetch_audio(url, play.get("quality"))
        except Exception:
            if not (media.get("local") and source == "qq" and re.fullmatch(r"[A-Za-z0-9]{10,20}", mid)):
                raise
            # A failed local file must not suppress a legitimate official
            # source. Retry once without local cache; never overwrite the library.
            fresh = await qqapi.song_url(mid, type_=str(cfg.get("quality") or "auto"), user_key=user_key,
                                         fallback=cfg.get("qualityFallback", True), official_only=True)
            if not fresh.get("url") or fresh.get("local") or fresh["url"] == url:
                raise
            dl = await fetch_audio(fresh["url"], fresh.get("quality"))
        path = dl["filePath"]
        files.add(path)
        if str(play.get("quality") or "") != "video" and not await _audio_ok(path):
            fresh = None
            if source == "qq" and re.fullmatch(r"[A-Za-z0-9]{10,20}", mid):
                try:
                    fresh = await qqapi.song_url(
                        mid,
                        type_="128",
                        user_key=user_key,
                        fallback=cfg.get("qualityFallback", True),
                        official_only=True,
                    )
                except Exception:
                    fresh = None
            if fresh and fresh.get("url") and not fresh.get("local") and fresh["url"] != url:
                dl = await fetch_audio(fresh["url"], fresh.get("quality") or "128")
                path = dl["filePath"]
                files.add(path)
            if not await _audio_ok(path):
                raise RuntimeError("音频文件无法解码")

        if preview:
            path = await _ffmpeg_mp3(path, max(5, min(60, int(cfg.get("previewSec", 30)))))
            files.add(path)
        passive_limited = _is_passive_limited(event)
        prefer_file = passive_limited and want_file

        async def send_voice_once():
            nonlocal text, sent
            voice = await _ffmpeg_mp3(path)
            files.add(voice)
            await plugin._send_chain(event, plugin._plain(text) if text else None, Record.fromFileSystem(voice))
            sent = True
            text = ""

        if want_voice and not prefer_file:
            try:
                await send_voice_once()
            except Exception as exc:
                plugin._log_warn(f"{platform} 语音转码/发送失败（{type(exc).__name__}），改发文件")

        if want_file and (prefer_file or not (passive_limited and sent)):
            file_path = path
            # QQ 官方 / 微信公众号等被动回复平台：优先发文件，且尽量发压缩 mp3，
            # 原 FLAC 体积大、格式也可能被官方文件接口拒绝。
            if passive_limited and Path(path).suffix.lower() not in {".mp3", ".m4a"}:
                try:
                    file_path = await _ffmpeg_mp3(path)
                    files.add(file_path)
                except Exception as exc:
                    plugin._log_warn(
                        f"{platform} 文件压缩失败（{type(exc).__name__}），尝试原文件"
                    )
            name = build_music_filename(singer=singer, title=title, ext=Path(file_path).suffix)
            file_sent = False
            # OneBot 的 File 消息段在 NapCat/Lagrange 上常被 retcode 0 吞掉，
            # 表现为“开了文件发送但群里没有文件”。aiocqhttp 优先走标准上传接口。
            if (
                platform == "aiocqhttp"
                and hasattr(event, "get_group_id")
                and hasattr(event, "get_sender_id")
            ):
                try:
                    action = "upload_group_file" if event.get_group_id() else "upload_private_file"
                    await onebot(event, action, {"file": file_path, "name": name})
                    file_sent = True
                    sent = True
                except Exception as upload_exc:
                    plugin._log_warn(
                        f"{platform} 文件上传失败（{type(upload_exc).__name__}），尝试消息文件段"
                    )
            if not file_sent:
                try:
                    await plugin._send_chain(event, plugin._plain(text) if text else None, File(name, file=file_path))
                    sent = True
                except Exception as exc:
                    plugin._log_warn(
                        f"{platform} 文件发送失败（{type(exc).__name__}: {exc}）"
                    )

        # 官方文件优先时，文件失败仍回退语音，避免整首歌没有任何音频。
        if prefer_file and not sent and want_voice:
            try:
                await send_voice_once()
            except Exception as exc:
                plugin._log_warn(f"{platform} 文件失败后的语音回退也失败（{type(exc).__name__}）")
    except Exception as exc:
        plugin._log_warn(f"媒体下载或校验失败（{type(exc).__name__}）")
    finally:
        for path in files:
            _schedule_cleanup(path, int(cfg.get("keepFileSec", 60)))
    if sent and not preview:
        try:
            await plugin._runtime_record(event, song)
        except Exception as exc:
            plugin._log_warn(f"本地听歌统计写入失败（{type(exc).__name__}）")
    if not sent and not card_ok:
        await plugin._reply(event, "\n".join(x for x in [text, "音频未能投递，可在来源页面查看。", page] if x))
    return {"ok": sent or card_ok, "downloaded": bool(files)}


async def deliver_video(
    plugin,
    event,
    mv: dict,
    url: str,
    *,
    cfg: dict,
    plugin_dir: str,
    download: bool = False,
    extra: list | None = None,
) -> dict:
    """发送 MV 视频（多适配器降级链）：

    - 受限平台（qq_official 被动回复受限）：跳过 URL 直发（官方 API 不支持外链视频直发），
      直接落盘发文件；extra（如 MV 详情卡图片）并入同一条消息省被动回复额度
    - 播放（其余平台）：Video.fromURL 直发 → 失败落盘 → 发下载文件（File，全平台支持）
    - 下载：落盘后直接发下载文件（File 主发送）
    - File 也失败：再试 Video.fromFileSystem（内嵌视频）
    - 全部失败：返回 filePath 供调用方兜底，最终回退 URL 文本

    返回 {"ok": bool, "reason": str, "url": str, "filePath": str}
    """
    from astrbot.api.message_components import File, Video

    title = mv.get("mvtitle") or mv.get("name") or mv.get("songName") or "MV"
    extra = list(extra or [])
    local_path = ""
    keep_sec = int(cfg.get("keepFileSec", 120))
    passive_limited = _is_passive_limited(event)
    if not (supports(event, "file") or supports(event, "video")):
        return {"ok": False, "reason": "unsupported", "url": "", "filePath": ""}
    file_name = _clean_track_text(title, 30) + ".mp4"

    async def _download() -> str:
        save_dir = get_temp_dir(cfg, plugin_dir)
        timeout = int(cfg.get("downloadTimeout") or 120000)
        dl = await download_audio(
            url, save_dir, "mv_" + _clean_track_text(title, 30), timeout, "video"
        )
        return dl["filePath"]

    if download:
        try:
            local_path = await _download()
        except Exception as err:
            plugin._log_warn(f"MV 下载失败: {err}")

    if not local_path and not download and not passive_limited:
        # 播放：直发 URL（受限平台跳过，官方 API 需先上传文件）
        try:
            await plugin._send_chain(event, *extra, Video.fromURL(url))
            return {"ok": True, "reason": "url", "url": url}
        except Exception as err:
            plugin._log_warn(f"MV 直发 URL 失败，尝试落盘: {err}")
            try:
                local_path = await _download()
            except Exception as err2:
                plugin._log_warn(f"MV 落盘失败: {err2}")

    if not local_path and (download or passive_limited):
        try:
            local_path = await _download()
        except Exception as err:
            plugin._log_warn(f"MV 落盘失败: {err}")

    if local_path:
        # 视频发送失败 / 下载模式：发下载文件（适配器支持 File 时发送）
        try:
            await plugin._send_chain(event, *extra, File(file_name, file=local_path))
            _schedule_cleanup(local_path, keep_sec)
            return {"ok": True, "reason": "file", "url": url, "filePath": local_path}
        except Exception as err:
            plugin._log_warn(f"MV 文件发送失败，重试视频组件: {err}")
            try:
                await plugin._send_chain(event, *extra, Video.fromFileSystem(local_path))
                _schedule_cleanup(local_path, keep_sec)
                return {"ok": True, "reason": "video-file", "url": url, "filePath": local_path}
            except Exception as err2:
                plugin._log_warn(f"MV 视频组件发送也失败: {err2}")
                _schedule_cleanup(local_path, 10)

    return {"ok": False, "reason": "send_fail", "url": url, "filePath": local_path}
