"""Translate the music engine's media intents into AstrBot public components."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import url2pathname

from astrbot.api.event import MessageChain
from astrbot.api import message_components as comp


# Absence means "do not send a component the adapter may silently drop".
# Unknown/plugin adapters still receive text, local/URL images, and safe links.
MEDIA = {
    "aiocqhttp": {"record", "video", "file", "upload", "music"},
    "qq_official": {"record", "video", "file"},
    "qq_official_webhook": {"record", "video", "file"},
    "telegram": {"record", "video", "file"},
    "discord": {"record", "video", "file"},
    "lark": {"record", "video", "file"},
    "dingtalk": {"record", "video", "file"},
    "kook": {"record", "video", "file"},
    "weixin_oc": {"video", "file"},
    "webchat": {"record", "video", "file"},
    "icqq": {"record", "video", "file"},
    "line": {"record", "video"},
    "mattermost": {"record", "video", "file"},
    "misskey": {"record", "video", "file"},
    "satori": {"record", "video", "file"},
    "slack": {"record", "file"},
    "wecom": {"record", "video", "file"},
    "wecom_ai_bot": {"record", "video", "file"},
    "weixin_official_account": {"record"},
}

SHARE = re.compile(
    r"(?:y\.qq\.com|qqmusic://|QQ音乐|100497308|music\.lua|structmsg|songmid=|"
    r"sdkshare_music|playsong\.html|open\.spotify\.com|spotify:(?:track|album|playlist):|"
    r"music\.apple\.com|itunes\.apple\.com)", re.I
)
STRUCTURED = {"json", "xml", "share", "music", "ark", "markdown"}


def inbound_segments(event) -> list[dict]:
    out = []
    for part in event.get_messages():
        kind = str(getattr(part, "type", "") or "").rsplit(".", 1)[-1].lower()
        if kind not in STRUCTURED:
            kind = type(part).__name__.lower()
        if kind in STRUCTURED:
            data = getattr(part, "data", None)
            if data is None:
                data = getattr(part, "content", None)
            if data is None and hasattr(part, "model_dump"):
                data = part.model_dump(mode="json")
            out.append({"type": kind, "data": data})
    # OneBot and SDK adapters may retain cards only in the original message
    # array; never send the whole raw object (sender info and SDK internals).
    raw = getattr(event.message_obj, "raw_message", None)
    if isinstance(raw, str) and len(raw) <= 16_384 and SHARE.search(raw):
        out.append({"type": "share", "data": raw})
    values = raw.get("message") if isinstance(raw, dict) else getattr(raw, "message", None)
    if isinstance(values, (list, tuple)):
        out.extend(
            {"type": segment["type"], "data": segment.get("data")}
            for segment in values
            if isinstance(segment, dict) and segment.get("type") in STRUCTURED
        )
    # Bound the worker payload and keep non-JSON SDK instances out of RPC.
    result, remaining = [], 65_536
    for segment in out[:20]:
        try:
            value = json.dumps(segment, ensure_ascii=False)
            remaining -= len(value)
            if remaining < 0:
                break
            result.append(segment)
        except (TypeError, ValueError):
            continue
    return result


class DeliveryError(RuntimeError):
    pass


def supports(event, media: str) -> bool:
    return media in MEDIA.get(event.get_platform_name(), set())


async def send_chain(event, *parts):
    parts = [part for part in parts if part is not None]
    for part in parts:
        kind = {comp.Record: "record", comp.File: "file", comp.Video: "video"}.get(type(part))
        if kind and not supports(event, kind):
            raise DeliveryError("当前适配器不支持该媒体")
    if parts and await event.send(MessageChain(chain=parts)) is False:
        raise DeliveryError("AstrBot 未能发送至目标会话")


class ProactiveEvent:
    def __init__(self, context, umo, user_key, platform=""):
        self.context = context
        self.unified_msg_origin = umo
        self.qqmusic_user_key = user_key
        self.platform = platform

    def get_platform_name(self):
        return self.platform

    def get_sender_name(self):
        return "定时推送"

    async def send(self, chain):
        return await self.context.send_message(self.unified_msg_origin, chain)


def _local(ref: str) -> str:
    if ref.startswith("file://"):
        parsed = urlsplit(ref)
        if parsed.netloc not in ("", "localhost"):
            raise DeliveryError("不支持远程 file URI")
        ref = url2pathname(unquote(parsed.path))
    path = Path(ref)
    if not path.is_file():
        raise DeliveryError("投递文件不存在")
    return str(path.resolve())


async def onebot(event, action, params):
    """Native QQ calls are confined to the active event's original peer."""
    if event.get_platform_name() != "aiocqhttp" or not isinstance(params, dict):
        raise DeliveryError("当前适配器不能发送原生 QQ 消息")
    call = getattr(getattr(event, "bot", None), "call_action", None)
    if not callable(call):
        raise DeliveryError("OneBot 客户端未就绪")
    group, sender = event.get_group_id(), event.get_sender_id()
    peer = str(group or sender)
    if not re.fullmatch(r"[1-9]\d{3,19}", peer):
        raise DeliveryError("OneBot 会话 ID 无效")
    kind = "group" if group else "private"
    identity = {"group_id" if group else "user_id": int(peer)}
    if action == f"upload_{kind}_file":
        return await call(action, **identity, file=_local(str(params.get("file") or "")),
                          name=str(params.get("name") or "QQ音乐"))
    if action not in (f"send_{kind}_msg", "send_msg"):
        raise DeliveryError("未开放该 OneBot 操作")
    chain = params.get("message")
    if not isinstance(chain, list) or len(chain) != 1 or not isinstance(chain[0], dict):
        raise DeliveryError("无效的 OneBot 消息段")
    part = chain[0]
    if part.get("type") not in {"music", "record", "file"} or not isinstance(part.get("data"), dict):
        raise DeliveryError("未开放该 OneBot 消息段")
    if part["type"] == "record" and str(part["data"].get("file", "")).startswith("base64://"):
        encoded = part["data"]["file"][len("base64://"):]
        if not encoded or len(encoded) > 28 * 1024 * 1024:
            raise DeliveryError("OneBot 语音体积过大")
        # Cheap structural validation without logging or decoding the audio.
        if len(encoded) % 4:
            raise DeliveryError("OneBot 语音编码无效")
    return await call(f"send_{kind}_msg", **identity, message=chain)
