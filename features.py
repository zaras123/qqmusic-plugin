"""AstrBot-native feature modules built on the QQ Music API contract."""
from __future__ import annotations

import asyncio
import base64
import json
import re
import shlex
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import uuid4

from astrbot.api.event import MessageChain
from astrbot.api.message_components import Image, Plain

from . import api, cards


PLATFORMS = {
    "qq": ("QQ音乐", "qq"),
    "netease": ("网易云音乐", "网易云", "网易", "网抑云", "netease", "163"),
    "kuwo": ("酷我", "kuwo"),
    "bilibili": ("B站", "哔哩哔哩", "哔哩", "bilibili"),
    "kugou": ("酷狗音乐", "酷狗", "kugou"),
    "qishui": ("汽水音乐", "汽水", "qishui", "抖音音乐"),
    "migu": ("咪咕音乐", "咪咕", "migu"),
    "youtube": ("YouTube", "油管", "yt"),
    "apple": ("Apple Music", "apple", "苹果音乐", "苹果", "am"),
    "jiosaavn": ("JioSaavn", "saavn"),
    "audius": ("Audius",),
}
ALIAS = {s.casefold(): key for key, aliases in PLATFORMS.items() for s in (key, *aliases)}
PREFIX = "|".join(re.escape(a) for a in sorted(ALIAS, key=len, reverse=True))
TICKET = r"(?:(近期|未来|往期|历史|全部|进行中))?(演唱会|演出|票务)([\s\S]*)"
TICKET_STATUS = {"近期": "soon", "未来": "upcoming", "往期": "past", "历史": "past", "全部": "all", "进行中": "ongoing"}
TICKET_NOTICE = "历史记录仅覆盖已归档场次；时间、票价和余票以购票页为准。"


def external_ref(text):
    uri = re.search(r"spotify:(track|album|playlist):([A-Za-z0-9]{22})\b", text, re.I)
    if uri:
        return "spotify", uri[1].lower(), f"https://open.spotify.com/{uri[1].lower()}/{uri[2]}"
    for candidate in re.findall(r"https?://[^\s<>\x22\x27\\，。]+", text.replace(r"\/", "/")):
        try:
            u = urlsplit(candidate.rstrip("),]"))
            if u.scheme != "https" or u.username or u.password or u.port not in (443, None):
                continue
            if u.hostname == "open.spotify.com":
                path = re.fullmatch(r"/(?:intl-[A-Za-z-]+/)?(track|album|playlist)/([A-Za-z0-9]{22})/?", u.path)
                if path:
                    return "spotify", path[1], f"https://open.spotify.com/{path[1]}/{path[2]}"
            if u.hostname in ("music.apple.com", "itunes.apple.com"):
                path = re.fullmatch(r"/([A-Za-z]{2})/(album|song)/([^/]{1,200}/)?(id)?([1-9]\d{0,18})/?", u.path)
                if path:
                    track = parse_qs(u.query).get("i", [""])[0]
                    query = urlencode({"i": track}) if re.fullmatch(r"[1-9]\d{0,18}", track) else ""
                    return "apple", "track" if query or path[2] == "song" else "album", u._replace(netloc="music.apple.com", query=query, fragment="").geturl()
        except ValueError:
            continue
    return None

WRITE_NAMES = (
    "歌单新建|新建歌单|歌单删除|删除歌单|歌单加歌|歌单删歌|喜欢歌曲|取消喜欢|"
    "收藏歌单取消|收藏歌单|收藏专辑取消|收藏专辑|清空不喜欢|取消不喜欢|不喜欢|发评论|删评论|"
    "音响力取消点赞|音响力点赞|音响力隐私|私信发送|私信删除会话|私信删除消息|私信清空会话|"
    "私信设置|私信全部已读|私信卡片操作"
)
EXTRA_RE = re.compile(
    rf"^#?qqm\s*(?:{TICKET}|(?:源|平台状态|音源状态|平台|海报|试听|界面|主题|ui|默认点歌|补充曲|"
    r"一起听|订阅列表|订阅|退订|定时列表|定时|取消定时|听歌榜|听歌状态|官方时长|听歌|"
    rf"勋章|成就进度|账号操作|登录帮助|{WRITE_NAMES})(?:\s*[\s\S]*)|"
    rf"(?:{PREFIX})(?:点歌|播放|歌词|状态|登录|登陆|清ck|ck|cookie|\s)[\s\S]*|(?:{PREFIX}))$",
    re.I,
)


def strict_number(raw):
    if not re.fullmatch(r"[1-9]\d{0,17}", str(raw)):
        raise ValueError("请输入正整数编号")
    return int(raw)


def id_list(raw, *, songs=False):
    tokens = re.split(r"[\s,，]+", raw)
    if not tokens or len(tokens) > 50:
        raise ValueError("一次最多 50 项")
    pattern = r"[1-9]\d{0,17}:\d{1,3}" if songs else r"[1-9]\d{0,17}"
    if not all(re.fullmatch(pattern, item) for item in tokens):
        raise ValueError("歌曲请用 songId:songType；其他编号请用正整数")
    return ",".join(dict.fromkeys(tokens))


def safe_page(raw):
    try:
        url = urlsplit(str(raw or ""))
        host = url.hostname or ""
        if url.scheme == "https" and not url.username and not url.password and any(
            host == domain or host.endswith("." + domain)
            for domain in ("qq.com", "damai.cn", "maoyan.com", "bilibili.com", "b23.tv", "music.163.com",
                           "kugou.com", "kuwo.cn", "apple.com", "spotify.com", "youtube.com", "youtu.be")
        ):
            # Never paste API tokens, signed media URLs, or unknown query fields into chats.
            return url._replace(query="", fragment="").geturl()
    except ValueError:
        pass
    return ""


def ticket_link(raw):
    try:
        url = urlsplit(str(raw or ""))
        host = url.hostname or ""
        if url.scheme != "https" or url.username or url.password or url.port:
            return ""
        if not any(host == d or host.endswith("." + d) for d in ("qq.com", "kugou.com", "e-piaopiao.com", "damai.cn", "maoyan.com")):
            return ""
        if any(re.search(r"token|cookie|secret|key|sign", key, re.I) for key in parse_qs(url.query, keep_blank_values=True)):
            return ""
        return url._replace(fragment="").geturl()
    except ValueError:
        return ""


def write_request(command, arg):
    # Exact route/field allowlist; parsing is pure and is tested without sending writes.
    direct = {
        "歌单新建": ("/songlist/create", "name"), "新建歌单": ("/songlist/create", "name"),
        "歌单删除": ("/songlist/delete", "dirId"), "删除歌单": ("/songlist/delete", "dirId"),
        "喜欢歌曲": ("/songlist/like", "songs"), "取消喜欢": ("/songlist/unlike", "songs"),
        "收藏歌单": ("/user/favSonglistWrite", "playlistId"), "收藏歌单取消": ("/user/unfavSonglistWrite", "playlistId"),
        "收藏专辑": ("/user/favAlbumWrite", "albumId"), "收藏专辑取消": ("/user/unfavAlbumWrite", "albumId"),
        "删评论": ("/comment/delete", "cmId"), "私信删除会话": ("/privatemessage/deleteSession", "sessionId"),
        "私信清空会话": ("/privatemessage/clearSession", "sessionId"),
        "私信全部已读": ("/privatemessage/markAllRead", "encryptUin"),
    }
    if command in direct:
        path, key = direct[command]
        if key == "dirId":
            arg = strict_number(arg)
        elif key in ("songs", "playlistId", "albumId"):
            arg = id_list(arg, songs=key == "songs")
        elif not arg or len(arg) > (64 if key == "name" else 128):
            raise ValueError("缺少参数或参数过长")
        return path, {key: arg, **({"cmdFlag": 1} if key == "encryptUin" else {})}
    if command in ("歌单加歌", "歌单删歌"):
        dir_id, _, songs = arg.partition(" ")
        return ("/songlist/addSongs" if command == "歌单加歌" else "/songlist/delSongs",
                {"dirId": strict_number(dir_id), "songs": id_list(songs.strip(), songs=True), "tid": 0})
    if command == "清空不喜欢":
        if arg:
            raise ValueError("清空不喜欢不需要额外参数")
        return "/user/cancelAllDislike", {}
    if command in ("不喜欢", "取消不喜欢"):
        kind, _, items = arg.partition(" ")
        types = {"歌曲": 1, "单曲": 1, "歌手": 2, "艺人": 2, "风格": 3, "曲风": 3}
        if kind not in types:
            raise ValueError("类型为歌曲、歌手、风格")
        return ("/user/addDislike" if command == "不喜欢" else "/user/cancelDislike",
                {"type": types[kind], "values": id_list(items.strip())})
    if command == "发评论":
        kind, song_id, content = arg.split(maxsplit=2)
        kinds = {"歌曲": 1, "专辑": 2, "歌单": 3}
        if kind not in kinds or len(content) > 500:
            raise ValueError("用法：发评论 歌曲 ID 内容 确认")
        return "/comment/add", {"id": strict_number(song_id), "biztype": kinds[kind], "content": content}
    if command in ("音响力点赞", "音响力取消点赞"):
        return "/soundpower/like", {"uin": strict_number(arg), **({"cancel": 1} if "取消" in command else {})}
    if command == "音响力隐私":
        if arg not in ("隐藏", "公开"):
            raise ValueError("用法：音响力隐私 隐藏/公开 确认")
        return "/soundpower/privacy", {"status": int(arg == "隐藏")}
    if command == "私信发送":
        uid, msg_type, text = arg.split(maxsplit=2)
        if not uid or len(uid) > 128 or len(text) > 500 or msg_type not in ("0", "1", "2", "3"):
            raise ValueError("用法：私信发送 用户 ID 类型 文本 确认")
        return "/privatemessage/send", {"userId": uid, "msgType": int(msg_type), "userInput": text}
    if command in ("私信删除消息", "私信设置", "私信卡片操作"):
        args = shlex.split(arg)
        route, names = {
            "私信删除消息": ("deleteMessage", ("sessionId", "msgId")),
            "私信设置": ("setConfig", ("configType", "configValue")),
            "私信卡片操作": ("cardAction", ("targetUserId", "msgType", "msgId", "value")),
        }[command]
        if len(args) != len(names) or any(len(x) > 128 for x in args):
            raise ValueError("参数不完整")
        return "/privatemessage/" + route, dict(zip(names, args))
    raise ValueError("未识别该写操作")


class FeatureCommands:
    async def _external_share(self, event, ref):
        provider, kind, url = ref
        route = f"/resolve/{provider}" + (f"/{kind}" if kind != "track" else "")
        body = api.unwrap_data(await api.request(route, {
            "url": url, "local": int(self._cfg().get("localLibrary", True)),
            **({"limit": 50, "match": 1} if kind != "track" else {}),
        }, user_key=self._user_key(event), shared=True))
        matched = [body.get("match")] if kind == "track" and body.get("matched") else [
            row.get("match") for row in (body.get("tracks") or []) if isinstance(row, dict) and row.get("matched")]
        songs = [song for i, row in enumerate(matched) if (song := api._normalize_search_item(row, i)) and song.get("songmid")]
        if not songs:
            return await self._reply(event, "已识别分享链接，但未匹配到可播放歌曲。")
        if kind == "track":
            await self._play_song(event, songs[0], "分享解析")
        else:
            container = body.get(kind) or {}
            await self._song_list(event, f"{container.get('name') or provider} · 已匹配 {len(songs)} 首", songs)

    async def _summary(self, event, title, rows, tip=""):
        data = {"title": title, "rows": [str(x) for x in rows][:25], "tip": tip}
        await self._reply_card_or_text(event, tpl_name="summary", data=data,
                                      format_text=lambda d: "\n".join([d["title"], *d["rows"], d["tip"]]).strip())

    async def _store(self, key, default):
        value = await self.get_kv_data(key, default)
        return default if value is None else value

    async def _dispatch_extra(self, event):
        cfg = self._cfg()
        if not cfg.get("enable", True):
            return
        text = re.sub(r"^#?qqm\s*", "", event.message_str.strip(), flags=re.I)
        try:
            if re.fullmatch(TICKET, text, re.S):
                await self._ticket(event, text)
            elif (match := re.fullmatch(rf"({WRITE_NAMES})(?:\s+([\s\S]*))?", text)):
                await self._account_write(event, match[1], match[2] or "")
            elif text in ("账号操作", "登录帮助"):
                await self._summary(event, "帐号与登录", ["#qqm登录：QQ；#qqm登录微信 / #qqm登录qq：App 扫码",
                    "外部平台凭据只在私聊配置；先使用 #qqm平台状态 查看能力",
                    "账号写操作仅管理员私聊：#qqm歌单新建 名称 确认", "支持歌单、收藏、不喜欢、评论、音响力及私信"])
            elif text.startswith(("源", "平台", "音源状态")):
                await self._source_command(event, text)
            elif text.startswith(("海报", "试听")):
                await self._preview_or_poster(event, text)
            elif text.startswith(("界面", "主题", "ui", "默认点歌", "补充曲")):
                await self._appearance(event, text)
            elif text.startswith(("订阅", "退订", "定时", "取消定时")):
                await self._manage_job(event, text)
            elif text.startswith(("听歌", "勋章", "成就进度", "官方时长")):
                await self._stats_command(event, text)
            elif text.startswith("一起听"):
                await self._reply(event, "AstrBot 公共适配器没有提供 QQ 群一起听房间接口；请从 QQ 客户端打开一起听。")
            else:
                handled = await self._platform_command(event, text)
                if not handled:
                    return
        except (api.ApiError, ValueError) as exc:
            await self._reply(event, str(exc))
        except Exception as exc:
            self._log_warn(f"扩展命令失败（{type(exc).__name__}）")
            await self._reply(event, "请求失败，请稍后重试或检查 API 版本。")
        event.stop_event()

    async def _source_for(self, event):
        uid = self._user_key(event)
        scope = self._scope(event)
        return await self._store(f"source:{scope}:{uid}", "") or await self._store(f"source:{scope}", "")

    async def _search(self, event, keyword, size=10, source="", fill=False):
        cfg = self._cfg()
        uid = self._user_key(event)
        chosen = source or (await self._source_for(event) if cfg.get("unlockV2") else "")
        if chosen and chosen != "qq" and not cfg.get("unlockV2"):
            raise api.ApiError("请先在 AstrBot 配置开启多平台音源")
        enabled = self._enabled_sources()
        if chosen and chosen != "qq" and chosen not in enabled:
            raise api.ApiError("该音源未启用")
        if chosen == "qq" and not cfg.get("qqEnabled", True):
            raise api.ApiError("QQ 音源已关闭")
        if not chosen and not cfg.get("qqEnabled", True):
            return await api.search_songs(keyword, page_size=size, user_key=uid, sources=enabled) if enabled else []
        songs = await api.search_songs(keyword, page_size=size, user_key=uid, source=(chosen if chosen != "qq" else ""),
                                      fill=bool(fill and not chosen and enabled and cfg.get("extraSources", True)))
        return [s for s in songs if not s.get("source") or s["source"] == "qq" or s["source"] in enabled]

    def _enabled_sources(self):
        cfg = self._cfg()
        configured = cfg.get("enabledSources") or []
        return [p for p in PLATFORMS if p != "qq" and cfg.get("unlockV2") and p in configured]

    async def _source_command(self, event, text):
        if text.startswith("源"):
            value = text[1:].strip().casefold()
            scope = self._scope(event)
            key = f"source:{scope}" if event.is_admin() else f"source:{scope}:{self._user_key(event)}"
            if not value:
                source = await self._source_for(event)
                return await self._reply(event, f"当前音源：{PLATFORMS.get(source, PLATFORMS['qq'])[0]}")
            source = ALIAS.get(value)
            if value in ("默认", "default", "清除"):
                await self.put_kv_data(key, "")
                return await self._reply(event, "已清除音源偏好")
            if source != "qq" and source not in self._enabled_sources():
                return await self._reply(event, "音源不可用，请先在 AstrBot 插件配置启用。")
            await self.put_kv_data(key, source)
            return await self._reply(event, f"当前音源已改为 {PLATFORMS[source][0]}")
        if "状态" in text:
            status = api.unwrap_data(await api.request("/platforms", user_key=self._user_key(event)))
            rows = []
            for p in status.get("list", []):
                if isinstance(p, dict):
                    status_text = "已配置凭据" if p.get("hasCredential") or p.get("loggedIn") else "未报告登录凭据"
                    rows.append(f"{p.get('label') or p.get('id') or p.get('source')} · {status_text}")
            return await self._summary(event, "音源状态", rows or ["API 未报告音源状态"])
        return await self._summary(event, "可用音源", [PLATFORMS[p][0] for p in ["qq", *self._enabled_sources()]
                                                     if p != "qq" or self._cfg().get("qqEnabled", True)],
                                   "#qqm源 平台 / #qqm<平台>点歌 关键词")

    async def _platform_command(self, event, text):
        match = re.fullmatch(rf"({PREFIX})\s*(点歌|播放|歌词|状态|登录|登陆|清ck|ck|cookie)?(?:\s*([\s\S]+))?", text, re.I)
        if not match:
            return False
        source, verb, arg = ALIAS[match[1].casefold()], (match[2] or "点歌").lower(), (match[3] or "").strip()
        if verb == "状态":
            status = api.unwrap_data(await api.request("/platforms", user_key=self._user_key(event)))
            rows = [p for p in status.get("list", []) if isinstance(p, dict) and source in {p.get("id"), p.get("source")}]
            await self._summary(event, f"{PLATFORMS[source][0]}状态",
                                ["已配置凭据" if p.get("hasCredential") or p.get("loggedIn") else "未报告登录凭据" for p in rows] or ["API 未报告该音源状态"])
            return True
        if verb in {"登录", "登陆", "ck", "cookie", "清ck"}:
            await self._provider_credentials(event, source, verb, arg)
            return True
        if not arg or not self._cfg().get("enableSongRequest", True):
            await self._reply(event, f"用法：#qqm{PLATFORMS[source][0]}{verb} 关键词")
            return True
        songs = await self._search(event, arg, 10 if verb == "点歌" else 1, source=source)
        if not songs:
            await self._reply(event, "没有搜到可用歌曲")
        elif verb == "点歌":
            await self._song_list(event, f"{PLATFORMS[source][0]} · {arg}", songs)
        elif verb == "歌词":
            await self._show_song_lyric(event, songs[0])
        else:
            await self._play_song(event, songs[0], "跨平台播放")
        return True

    async def _provider_credentials(self, event, source, verb, arg):
        uid = self._user_key(event)
        if not event.is_private_chat():
            return await self._reply(event, "凭据和扫码仅在私聊使用。")
        if source not in self._enabled_sources():
            return await self._reply(event, "此音源未启用；QQ 音乐请使用 #qqm登录。")
        cookies = {"netease", "kugou", "kuwo", "bilibili", "qishui", "apple"}
        if verb in ("ck", "cookie", "清ck"):
            if source not in cookies or (verb != "清ck" and not 0 < len(arg) < 65536):
                return await self._reply(event, "该音源不支持此次操作或缺少凭据。")
            try:
                if source == "apple" and verb == "清ck":
                    await api.request("/apple/cookies", method="delete", user_key=uid)
                else:
                    await api.request(f"/{source}/cookies", {("cookies" if source == "apple" else "cookie"): arg if verb != "清ck" else ""},
                                      "post", uid)
            except api.ApiError:
                return await self._reply(event, "更新凭据失败，请在后端检查配置与 API 版本。")
            return await self._reply(event, "凭据已更新。")
        if not event.is_admin():
            return await self._reply(event, "扫码登录仅限管理员。")
        if source not in {"netease", "bilibili", "kugou", "qishui"}:
            return await self._reply(event, "此音源没有扫码接口。")
        try:
            await self._start_provider_qr(event, source, uid)
        except Exception as exc:
            self._log_warn(f"外部平台凭据操作失败（{type(exc).__name__}）")
            await self._reply(event, "扫码接口未返回可用二维码，请检查后端。")

    async def _start_provider_qr(self, event, source, uid):
        # Keep one poll task per account, cancelled by Star. Never echo a cookie.
        data = api.unwrap_data(await api.request(f"/{source}/login/qrcode", user_key=uid))
        image = data.get("img") or data.get("qrcode") or data.get("qrcodeBase64") or data.get("qrimg") or data.get("base64")
        key = data.get("token") or data.get("qrcodeID") or data.get("key") or data.get("qrcode_key") or data.get("unikey")
        if not image or not key:
            raise ValueError("缺少二维码或会话 ID")
        image = str(image).split(";base64,")[-1]
        base64.b64decode(image, validate=True)
        self._stop_poll(uid)
        await self._send_chain(event, Image.fromBase64(image))
        record = {"platform": source}

        async def poll():
            try:
                for _ in range(60):
                    await asyncio.sleep(3)
                    path = "/qishui/login/status" if source == "qishui" else f"/{source}/login/qrcode/check"
                    body = await api.request(path, {"token" if source == "qishui" else "key": key}, user_key=uid)
                    status = api.unwrap_data(body)
                    if status.get("success") is True or status.get("loggedIn") is True or str(status.get("code")) == "803":
                        await self._reply(event, f"{PLATFORMS[source][0]}扫码成功")
                        return
                    if str(status.get("status") or status.get("code")) in ("expired", "800"):
                        break
                await self._reply(event, "二维码已过期。")
            except api.ApiError:
                await self._reply(event, "扫码状态查询失败。")
            finally:
                self._pop_task_if_current(uid, record)

        record["task"] = self._run_login_task(poll())
        self._register_task(uid, record)

    async def _account_write(self, event, command, arg):
        if not event.is_admin() or not event.is_private_chat():
            return await self._reply(event, "账号写操作仅允许 AstrBot 管理员在私聊执行。")
        confirmed = re.fullmatch(r"(?:(.*?)\s+)?确认", arg.strip(), re.S)
        if not confirmed:
            return await self._reply(event, "请核对操作与参数，并在末尾添加「确认」。")
        path, params = write_request(command, confirmed[1] or "")
        try:
            body = await api.request(path, params, "post", self._user_key(event))
            status = api.unwrap_data(body)
            if status.get("code") not in (None, 0, "0") or status.get("ok") is False:
                raise api.ApiError("平台未确认写入成功")
        except api.ApiError:
            return await self._reply(event, "写入未确认。请核对本人登录态、参数和 API 日志；不要盲目重复写入。")
        return await self._reply(event, f"{command}：API 已确认。")

    async def _song_list(self, event, title, songs):
        await self._session_set(event, {"keyword": title, "data": songs})
        data = cards.build_list_card_data(title, songs, cfg=self._cfg())
        await self._reply_card_or_text(event, tpl_name="qqmusic-list", data=data,
                                      format_text=lambda d: cards.format_song_list(songs, title))

    async def _play_song(self, event, song, reason):
        from .delivery import deliver_song

        cfg = self._cfg()
        play = await self._resolve_play(song, cfg, self._user_key(event))
        await self._send_detail_card(event, song, play, source=reason, mv_vid=play.get("mvVid") or "")
        if play.get("url"):
            await deliver_song(self, event, song, play, cfg=cfg, plugin_dir=str(self._data_dir),
                               options={"skipTextInfo": True})

    async def _song_arg(self, event, arg):
        if not arg or re.fullmatch(r"[1-9]\d?", arg):
            session = await self._session_get(event)
            n = int(arg or 1)
            if not session or session.get("type") in {"topCategory", "mvList", "recommend"} or n > len(session.get("data", [])):
                raise ValueError("请先点歌，或填写歌名")
            return session["data"][n - 1]
        rows = await self._search(event, arg, 1)
        if not rows:
            raise ValueError("没有搜到相关歌曲")
        return rows[0]

    async def _show_song_lyric(self, event, song, *, poster=False):
        body = await api.lyric(song["songmid"], self._user_key(event))
        words = body.get("lyric") if isinstance(body, dict) else ""
        if not isinstance(words, str) or not words.strip():
            return await self._reply(event, "未查询到歌词")
        lines = [re.sub(r"^\[[^]]+\]", "", x).strip() for x in words.splitlines()]
        payload = cards.build_lyric_card_data(
            song_name=song.get("songName") or "未知",
            singer_name=song.get("singerName") or "",
            cover=song.get("cover") or "",
            album_name=song.get("albumName") or "",
            songmid=song["songmid"],
            lines=[x for x in lines if x],
            cfg=self._cfg(),
        )
        await self._reply_card_or_text(
            event,
            tpl_name="qqmusic-poster" if poster else "qqmusic-lyric",
            data=payload,
            format_text=cards.format_lyric_text,
        )

    async def _preview_or_poster(self, event, text):
        from .delivery import deliver_song

        verb, arg = text[:2], text[2:].strip()
        song = await self._song_arg(event, arg)
        if verb == "海报":
            await self._show_song_lyric(event, song, poster=True)
            return
        play = await self._resolve_play(song, self._cfg(), self._user_key(event))
        if not play.get("url"):
            return await self._reply(event, "当前曲目无可用试听")
        await deliver_song(self, event, song, play, cfg=self._cfg(), plugin_dir=str(self._data_dir),
                           options={"preview": True, "skipNativeCard": True, "skipCustomCard": True})

    async def _appearance(self, event, text):
        command, value = re.fullmatch(r"(默认点歌|补充曲|界面|主题|ui)\s*([\s\S]*)", text, re.I).groups()
        command = command.lower()
        if not value:
            return await self._summary(event, "渲染与点歌设置", [
                f"主题：{self._cfg().get('uiTheme', 'classic')}（classic / apple / nebula / multi）",
                "#qqm界面 深色 / 浅色 / 自动", "#qqm默认点歌 开/关 · #qqm补充曲 开/关"])
        if not event.is_admin():
            return await self._reply(event, "仅 AstrBot 管理员可修改。")
        if command in ("默认点歌", "补充曲") and value in {"开启", "关闭", "开", "关"}:
            key = "defaultPickSong" if command == "默认点歌" else "extraSources"
            self.config[key] = value.startswith("开")
        elif command in ("界面", "主题", "ui") and value in ("classic", "apple", "nebula", "multi"):
            self.config["uiTheme"] = value
        elif command in ("界面", "主题", "ui") and value in ("深色", "浅色", "自动"):
            self.config["uiDark"] = value
        else:
            return await self._reply(event, "未知设置项。")
        self.config.save_config()
        await self._reply(event, "已保存设置。")

    async def _ticket(self, event, text):
        status, category, tail = re.fullmatch(TICKET, text, re.S).groups()
        tail = tail.strip()
        uid = self._user_key(event)
        key = f"ticket:{self._scope(event)}:{uid}"
        if tail == "帮助":
            return await self._summary(event, "演出票务", [
                "#qqm近期演唱会 / #qqm往期演出", "#qqm演出 北京 / 城市=北京 艺人=歌手 页=2",
                "#qqm演出下一页 / #qqm演出上一页 / #qqm演出详情1 / #qqm演出城市 / #qqm演出分类"], TICKET_NOTICE)
        if tail in ("城市", "分类"):
            body = api.unwrap_data(await api.request("/ticket/cities" if tail == "城市" else "/ticket/categories", user_key=uid))
            rows = body.get("cities" if tail == "城市" else "list") or []
            return await self._summary(event, f"支持查询的{tail}",
                                       [x.get("name") or x.get("label") for x in rows if isinstance(x, dict)] or rows)
        if tail.startswith("同步"):
            if not event.is_admin():
                return await self._reply(event, "同步演出仅限管理员。")
            city = tail[2:].strip()
            if not re.fullmatch(r"[^\s:：=]{1,30}", city):
                raise ValueError("一次只能同步一个城市或艺人名，例如 #qqm演出同步 北京")
            await api.request("/ticket/sync", {"city": city, "limit": 1, "detailLimit": 80}, "post", uid, timeout_s=180)
            tail = city
        previous = await self._store(key, {})
        usable = bool(previous and time.time() - previous["at"] < 600)
        if tail.startswith("详情"):
            show = tail[2:].strip().lower()
            if show.isdecimal():
                i = strict_number(show) - 1
                if not usable or i >= len(previous["ids"]):
                    raise ValueError("演出列表已过期或序号无效")
                show = previous["ids"][i]
            if not re.fullmatch(r"[em][1-9]\d{0,17}", show):
                raise ValueError("请填写序号或演出编号 e123 / m123")
            row = api.unwrap_data(await api.request("/ticket/show", {"id": show}, user_key=uid))
            if not row.get("name"):
                raise api.ApiError("未找到演出详情")
            rows = [self._ticket_line(row), *[str(row[k])[:300] for k in ("address", "saleStart", "summary") if row.get(k)]]
            for session in (row.get("sessions") or [])[:8]:
                if not isinstance(session, dict):
                    continue
                rows.append(" · ".join(str(session[k]) for k in ("name", "start", "end", "saleStart") if session.get(k)))
                tiers = [f"{t.get('level') or '票档'} ¥{t.get('price', '待公布')}" + ("（已售罄）" if t.get("soldOut") else "")
                         for t in (session.get("tiers") or [])[:8] if isinstance(t, dict)]
                if tiers:
                    rows.append(" · ".join(tiers))
            link = ticket_link(row.get("link") or row.get("ticketUrl") or row.get("sourceUrl") or row.get("url"))
            if link:
                rows.append(link)
            await self._summary(event, row["name"], rows, TICKET_NOTICE)
            if link:
                await self._reply(event, link)
            return
        filters = {"status": TICKET_STATUS.get(status, "upcoming"), "group": "concert" if category == "演唱会" else "",
                   "page": 1, "pageSize": 6}
        if tail in ("下一页", "上一页"):
            if not usable:
                raise ValueError("请先查询演出")
            filters = dict(previous["filters"])
            page = filters["page"] + (1 if tail == "下一页" else -1)
            if not 1 <= page <= previous["maxPage"]:
                raise ValueError("已到首页或最后一页")
            filters["page"] = page
        else:
            words = tail.split()
            if words and words[0] in TICKET_STATUS:
                filters["status"] = TICKET_STATUS[words.pop(0)]
            names = {"城市": "city", "分类": "category", "艺人": "artist", "歌手": "artist", "关键词": "q", "页": "page"}
            keywords = []
            for word in words:
                pair = re.fullmatch(r"([^=：:]+)[=：:](.*)", word)
                if not pair:
                    keywords.append(word)
                elif pair[1] not in names or not 0 < len(pair[2]) <= 100:
                    raise ValueError("筛选项为城市、分类、艺人、关键词、页")
                else:
                    field = names[pair[1]]
                    filters[field] = strict_number(pair[2]) if field == "page" else pair[2]
            if len(" ".join(keywords)) > 100 or filters["page"] > 100000:
                raise ValueError("关键词或页码超出范围。")
            filters["q"] = " ".join(filter(None, [filters.get("q"), *keywords]))
        data = api.unwrap_data(await api.request("/ticket/archive", filters, user_key=uid, timeout_s=45))
        rows = data.get("list")
        if not isinstance(rows, list):
            raise api.ApiError("API 未返回演出列表")
        rows = [r for r in rows if isinstance(r, dict)]
        max_page = max(1, (int(data.get("total", len(rows))) + 5) // 6)
        await self.put_kv_data(key, {"filters": filters, "ids": [str(r.get("key") or "") for r in rows], "at": time.time(), "maxPage": max_page})
        await self._summary(event, f"演出列表 · {filters['page']}/{max_page}",
                            [f"{i}. {self._ticket_line(row)}" for i, row in enumerate(rows, 1)] or ["未收录匹配的演出"],
                            "#qqm演出详情1 · #qqm演出下一页\n" + TICKET_NOTICE)

    @staticmethod
    def _ticket_line(row):
        price_min, price_max = row.get("minPrice") or row.get("priceMin"), row.get("maxPrice") or row.get("priceMax")
        price = f"¥{price_min}" + (f"–{price_max}" if price_max and price_max != price_min else "") if price_min else ""
        status = {"past": "已结束", "ongoing": "进行中", "soon": "七天内开演", "upcoming": "未开始"}.get(row.get("status"))
        return " · ".join(str(x) for x in (row.get("name"), row.get("artist"), row.get("city"), row.get("venue"),
                                           row.get("start") or row.get("showTime") or row.get("dateText"), price,
                                           "已售罄" if row.get("soldOut") else status) if x)

    async def _runtime_record(self, event, song):
        if not self._cfg().get("statsEnable", True):
            return
        scope, uid = self._scope(event), self._user_key(event)
        sec = min(3600, max(0, int(song.get("interval") or 0)))
        if not sec:
            return
        async with self._state_lock:
            key = f"stats:{scope}"
            state = await self._store(key, {})
            days = state.setdefault(uid, {})
            day = datetime.now().date()
            current = days.setdefault(day.isoformat(), {"seconds": 0, "songs": 0, "name": "听众"})
            current["seconds"] += sec
            current["songs"] += 1
            current["name"] = str(event.get_sender_name() or "听众")[:30]
            cutoff = (day - timedelta(days=max(1, int(self._cfg().get("statsKeepDays", 60))))).isoformat()
            state = {u: {d: r for d, r in timeline.items() if d >= cutoff} for u, timeline in state.items()}
            cap = max(1, min(500, int(self._cfg().get("statsMaxUsersPerGroup", 100))))
            state = dict(sorted(state.items(), key=lambda item: (max(item[1], default=""), item[0] == uid), reverse=True)[:cap])
            await self.put_kv_data(key, state)

    async def _stats_command(self, event, text):
        uid = self._user_key(event)
        if text in ("听歌状态", "官方时长", "勋章", "勋章任务", "成就进度"):
            await self._official_account_stats(event, text, uid)
            return
        state = await self._store(f"stats:{self._scope(event)}", {})
        today = datetime.now().date()
        if text.startswith("听歌榜"):
            if event.is_private_chat():
                return await self._reply(event, "群听歌榜仅在群聊使用。")
            cutoff = today if "今日" in text else today - timedelta(days=today.weekday()) if "本周" in text else None
            rows = []
            for timeline in state.values():
                selected = [a for d, a in timeline.items() if cutoff is None or d >= cutoff.isoformat()]
                if selected:
                    rows.append((sum(x["seconds"] for x in selected), selected[-1]["name"]))
            return await self._summary(event, "本会话听歌榜", [f"{i}. {n} · {s // 60} 分钟"
                 for i, (s, n) in enumerate(sorted(rows, reverse=True)[:10], 1)] or ["暂无播放记录"])
        own = state.get(uid, {})
        await self._summary(event, "我的听歌统计", [
            f"今日：{own.get(today.isoformat(), {}).get('seconds', 0) // 60} 分钟",
            f"近七天：{sum(a['seconds'] for d, a in own.items() if d >= (today - timedelta(days=6)).isoformat()) // 60} 分钟",
            f"记录期累计：{sum(a['seconds'] for a in own.values()) // 60} 分钟 · {sum(a['songs'] for a in own.values())} 首"],
            "仅统计本会话成功投递的曲目，不代表平台真实听歌时长。")

    async def _official_account_stats(self, event, text, uid):
        if text.startswith(("勋章", "成就")):
            if not self._cfg().get("medalEnable", True):
                return await self._reply(event, "未启用勋章查询。")
            act = self._cfg().get("medalActID", "")
            module, method, args = (("music.activeCenter.ActTaskNewSvr", "GetTaskList", {"actID": act}) if act
                                    else ("music.activeCenter.PlaypagetaskSvr", "GetTaskDetail", {}))
            body = api.unwrap_data(await api.request("/cgi", {"module": module, "method": method, "param": json.dumps(args)}, user_key=uid))
            # Render only explicit progress fields; never dump the complete upstream data.
            tasks = body.get("tasks") or body.get("taskList") or (body.get("data") or {}).get("taskList") or []
            return await self._summary(event, "QQ 音乐勋章", [
                f"{x.get('name') or x.get('title') or '任务'}：{x.get('progress', '未报告')}" for x in tasks if isinstance(x, dict)]
                or ["平台未报告任务详情"])
        body = api.unwrap_data(await api.request("/listening/profile", {"platform": "qq"}, user_key=uid))
        seconds = body.get("seconds")
        if not isinstance(seconds, int) or seconds < 0:
            return await self._reply(event, "平台未报告个人时长；请检查本人 QQ 音乐登录态。")
        await self._summary(event, "平台听歌状态", [f"{'今日' if body.get('metric') == 'today' else '累计'}：{seconds // 60} 分钟"])

    async def _manage_job(self, event, text):
        if not event.get_group_id():
            return await self._reply(event, "订阅和定时点歌仅支持群组会话。")
        scope = self._scope(event)
        if text in ("订阅列表", "定时列表"):
            state = await self._store("push-jobs", [])
            kind = "sub" if text == "订阅列表" else "schedule"
            return await self._summary(event, text, [f"{x['id']} · {x.get('time', '')} {x['label']}".strip()
                                                    for x in state if x["scope"] == scope and x["kind"] == kind] or ["暂无任务"])
        if not event.is_admin():
            return await self._reply(event, "仅 AstrBot 管理员可更改定时与订阅。")
        match = re.fullmatch(r"(取消定时|退订|订阅|定时)\s+(.+)", text, re.S)
        if not match:
            raise ValueError("用法：#qqm订阅 歌手 / #qqm定时 HH:MM 歌名 / #qqm取消定时 编号")
        action, arg = match[1], match[2].strip()
        entry = {"id": uuid4().hex[:8], "scope": scope, "uid": self._user_key(event), "label": arg,
                 "platform": event.get_platform_name()}
        if action == "订阅":
            artists = await api.search_singers(arg, user_key=entry["uid"])
            if not artists or not artists[0].get("singermid"):
                raise ValueError("未找到可订阅的歌手")
            singer = artists[0]
            seed = await api.singer_songs(singer["singermid"], page_size=20, user_key=entry["uid"])
            entry.update(kind="sub", singer=singer["singermid"], label=singer.get("singername") or singer.get("name") or arg,
                         known=[r["songmid"] for r in seed.get("list", []) if r.get("songmid")], last=time.time())
        elif action == "定时":
            when, _, label = arg.partition(" ")
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", when) or not label:
                raise ValueError("格式：#qqm定时 HH:MM 歌名")
            entry.update(kind="schedule", time=when, label=label)
        async with self._state_lock:
            jobs = await self._store("push-jobs", [])
            if action in ("取消定时", "退订"):
                kind = "sub" if action == "退订" else "schedule"
                next_jobs = [x for x in jobs if not (x["scope"] == scope and x["kind"] == kind and arg in (x["id"], x["label"]))]
                await self.put_kv_data("push-jobs", next_jobs)
                return await self._reply(event, f"已取消 {len(jobs) - len(next_jobs)} 项")
            cap = int(self._cfg().get("subMaxPerGroup" if action == "订阅" else "scheduleMaxPerGroup", 10))
            existing = [x for x in jobs if x["scope"] == scope and x["kind"] == entry["kind"]]
            if len(existing) >= cap or any((x["label"], x.get("time")) == (entry["label"], entry.get("time")) for x in existing):
                raise ValueError("已有相同任务或已达会话上限")
            await self.put_kv_data("push-jobs", [*jobs, entry])
        await self._reply(event, f"任务已保存：{entry['id']} · {entry['label']}")

    async def _job_loop(self):
        while True:
            await asyncio.sleep(30)
            try:
                await self._run_jobs()
            except Exception as exc:
                self._log_warn(f"调度一轮失败（{type(exc).__name__}）")

    async def _run_jobs(self):
        if not self._cfg().get("enable", True):
            return
        now = datetime.now()
        today = now.date().isoformat()
        # Record due/scan markers before side effects to avoid duplicate push on restart.
        async with self._state_lock:
            jobs = await self._store("push-jobs", [])
            active = []
            for item in jobs:
                if item["kind"] == "schedule" and item.get("last") != today:
                    hour, minute = (int(x) for x in item["time"].split(":"))
                    scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if timedelta(0) <= now - scheduled < timedelta(minutes=10):
                        item["last"] = today
                        active.append(dict(item))
                if item["kind"] == "sub":
                    interval = float(self._cfg().get("subScanHours", 6)) * 3600
                    if interval > 0 and time.time() - item.get("last", 0) >= interval:
                        item["last"] = time.time()
                        active.append(dict(item))
            if active:
                await self.put_kv_data("push-jobs", jobs)
        for item in active:
            try:
                await self._deliver_job(item)
            except (api.ApiError, ValueError, RuntimeError) as exc:
                self._log_warn(f"推送 {item['id']} 失败（{type(exc).__name__}）")

    async def _deliver_job(self, item):
        from .delivery import deliver_song
        from .astrbot_transport import ProactiveEvent

        uid, scope = item["uid"], item["scope"]
        event = ProactiveEvent(self.context, scope, uid, item.get("platform", ""))
        if item["kind"] == "sub":
            body = await api.singer_songs(item["singer"], page_size=20, user_key=uid)
            rows = body.get("list", [])
            recent = [r for r in rows if r.get("songmid") and r["songmid"] not in item.get("known", [])]
            if not recent:
                return
            await event.send(MessageChain(chain=[Plain(cards.format_song_list(recent[:3], f"{item['label']} · 订阅更新"))]))
            async with self._state_lock:
                jobs = await self._store("push-jobs", [])
                for job in jobs:
                    if job["id"] == item["id"]:
                        job["known"] = list(dict.fromkeys([r["songmid"] for r in rows if r.get("songmid")] + item.get("known", [])))[:60]
                await self.put_kv_data("push-jobs", jobs)
            await self._session_set(event, {"data": recent[:3], "type": "subNew"})
            return
        songs = await api.search_songs(item["label"], page_size=1, user_key=uid)
        if songs:
            play = await self._resolve_play(songs[0], self._cfg(), uid)
            await deliver_song(self, event, songs[0], play, cfg=self._cfg(), plugin_dir=str(self._data_dir))
