"""Use the real AstrBot SDK plus deterministic event and HTTP fixtures."""
from __future__ import annotations

import asyncio
import base64
import importlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from PIL import Image as PillowImage

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get("ASTRBOT_ROOT"):
    runtime = ROOT / "temp" / "astrbot-tests"
    runtime.mkdir(parents=True, exist_ok=True)
    os.environ["ASTRBOT_ROOT"] = str(runtime)

import yaml
from aiohttp import web
from astrbot import __version__ as astrbot_version
from astrbot.api import message_components as C
from astrbot.core.star.star_handler import EventType, star_handlers_registry

NAME = "astrbot_plugin_qqmusic"
if NAME not in sys.modules:
    spec = importlib.util.spec_from_file_location(NAME, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    package = importlib.util.module_from_spec(spec)
    sys.modules[NAME] = package
    spec.loader.exec_module(package)
main = importlib.import_module(f"{NAME}.main")
features = importlib.import_module(f"{NAME}.features")
transport = importlib.import_module(f"{NAME}.astrbot_transport")
delivery = importlib.import_module(f"{NAME}.delivery")
library_web = importlib.import_module(f"{NAME}.library_web")


class FakeEvent:
    def __init__(self, text="", *, platform="webchat", group="g", sender="u", admin=False, bot=None):
        self.message_str, self.platform, self.group = text, platform, group
        self.sender, self.admin, self.bot = sender, admin, bot
        self.unified_msg_origin = f"{platform}_1:{'GroupMessage' if group else 'FriendMessage'}:{group or sender}"
        self.message_obj = SimpleNamespace(message=[], raw_message=None, group_id=group, message_id="one")
        self.sent, self.stopped = [], False

    def get_messages(self):
        return self.message_obj.message

    def get_platform_name(self):
        return self.platform

    def get_platform_id(self):
        return self.platform + "_1"

    def get_group_id(self):
        return self.group

    def get_sender_id(self):
        return self.sender

    def get_sender_name(self):
        return "测试用户"

    def get_self_id(self):
        return "bot_id"

    def is_private_chat(self):
        return not self.group

    def is_admin(self):
        return self.admin

    def stop_event(self):
        self.stopped = True

    async def send(self, chain):
        self.sent.append(chain)

    @property
    def text(self):
        return "\n".join(c.text for m in self.sent for c in m.chain if isinstance(c, C.Plain))


class Config(dict):
    def save_config(self):
        pass


class AstrBotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = json.loads((ROOT / "_conf_schema.json").read_text(encoding="utf8"))
        self.calls, self.kv = [], {}
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / "temp")
        self.addCleanup(self.tmp.cleanup)
        self.media = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 400
        def qr(color):
            output = BytesIO()
            PillowImage.new("RGB", (16, 16), color).save(output, format="PNG")
            return base64.b64encode(output.getvalue()).decode("ascii")

        self.qq_qr = qr("white")
        self.wx_qr = qr("black")
        self.only_wx_fixture = False
        self.app = web.Application()
        self.app.router.add_route("*", "/{tail:.*}", self.api)
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.addAsyncCleanup(self.runner.cleanup)
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.base = f"http://127.0.0.1:{self.runner.addresses[0][1]}"
        self.config = Config({k: v["default"] for k, v in self.schema.items()})
        self.config.update(apiBase=self.base, renderListCard=False, keepFileSec=0, statsEnable=True)
        self.star = main.QQMusicPlugin(SimpleNamespace(send_message=AsyncMock(return_value=True)), self.config)
        self.star._data_dir = Path(self.tmp.name)

        async def set_kv(key, value):
            self.kv[key] = value

        self.star.put_kv_data = set_kv
        self.star.get_kv_data = AsyncMock(side_effect=lambda k, default: self.kv.get(k, default))
        await self.star.initialize()
        self.addAsyncCleanup(self.star.terminate)

    async def api(self, req):
        body = await req.json() if req.method == "POST" else dict(req.query)
        self.calls.append((req.method, req.path, body, req.headers.get("x-qqmusic-user")))
        if req.path == "/search":
            source = body.get("source", "")
            payload = {"list": [{"name": body["key"], "songmid": "testMID001", "singerName": "歌手",
                                  "source": source, "interval": 180}]}
        elif req.path == "/song/url":
            payload = {"url": self.base + "/audio", "quality": "128"}
        elif req.path == "/library/item":
            payload = {"id": "lib_demo", "fileUrl": self.base + "/bad", "quality": "128"}
        elif req.path == "/audio":
            return web.Response(body=self.media, content_type="audio/wav")
        elif req.path == "/bad":
            return web.Response(body=b"<html>" * 100, content_type="text/html")
        elif req.path == "/lyric":
            payload = {"lyric": "[00:01.00]测试歌词"}
        elif req.path == "/login/webqr":
            payload = {"sessionId": "test-webqr", "qrcodeWx": "data:image/png;base64," + self.wx_qr}
            if not self.only_wx_fixture:
                payload["qrcodeQq"] = "data:image/png;base64," + self.qq_qr
        elif req.path == "/login/qr":
            payload = {"qrcodeID": "test-app", "qrcodeBase64": self.wx_qr}
        elif req.path == "/ticket/archive":
            payload = {"list": [{"key": "e123", "name": "测试演出", "city": "北京", "priceMin": 99}],
                       "total": 8, "page": int(body.get("page", 1))}
        elif req.path == "/ticket/show":
            payload = {"name": "测试演出详情", "key": "e123", "venue": "测试场馆"}
        else:
            payload = {"ok": True}
        return web.json_response({"result": 100, "data": payload})

    async def test_metadata_and_handlers(self):
        self.assertEqual(astrbot_version, "4.29.4")
        md = yaml.safe_load((ROOT / "metadata.yaml").read_text(encoding="utf8"))
        self.assertEqual(md["name"], NAME)
        self.assertTrue(self.schema["apiToken"]["secret"])
        self.assertEqual(set(md["support_platforms"]), set(transport.MEDIA))
        registered = [h for h in star_handlers_registry.get_handlers_by_event_type(EventType.AdapterMessageEvent, only_activated=False)
                      if h.handler_module_path == main.__name__]
        self.assertGreaterEqual(len(registered), 38)
        self.assertIn("migrated_commands", [h.handler_name for h in registered])
        self.assertIn("resolve", [h.handler_name for h in registered])

    async def test_pick_scope_play_and_stats(self):
        first = FakeEvent("#qqm点歌 第一首", sender="u1")
        second = FakeEvent("#qqm点歌 第二首", sender="u2")
        await self.star.pick_song(first)
        await self.star.pick_song(second)
        self.assertTrue(first.stopped)
        self.assertIn("第一首", first.text)
        self.assertEqual((await self.star._session_get(first))["data"][0]["songName"], "第一首")
        self.assertEqual((await self.star._session_get(second))["data"][0]["songName"], "第二首")
        await self.star.choose_song(FakeEvent("#qqm听1", platform="telegram", sender="u1"))
        self.assertFalse(any(row[1] == "/song/url" for row in self.calls))
        chooser = FakeEvent("#qqm听1", sender="u1")
        await self.star.choose_song(chooser)
        self.assertTrue(chooser.stopped)
        self.assertTrue(any(isinstance(c, C.Record) for msg in chooser.sent for c in msg.chain))
        self.assertTrue(any(isinstance(c, C.File) for msg in chooser.sent for c in msg.chain))
        self.assertIn("第一首", chooser.text)
        stats = FakeEvent("#qqm听歌", sender="u1")
        await self.star.migrated_commands(stats)
        self.assertIn("3 分钟", stats.text)

    async def test_provider_search(self):
        self.config.update(unlockV2=True, enabledSources=["netease"])
        e = FakeEvent("#qqm网易点歌 测试曲")
        self.assertIsNotNone(features.EXTRA_RE.fullmatch(e.message_str))
        await self.star.migrated_commands(e)
        self.assertTrue(e.stopped)
        self.assertIn("测试曲", e.text)
        self.assertIn("netease", [call[2].get("source") for call in self.calls if call[1] == "/search"])

    async def test_lyric_card_accepts_search_metadata(self):
        self.config.update(renderListCard=False)
        e = FakeEvent("#qqm歌词 晴天")
        await self.star.get_lyric(e)
        self.assertIn("测试歌词", e.text)
        self.assertNotIn("歌词失败", e.text)

    async def test_qr_commands_separate_web_qq_and_app(self):
        self.star._start_webqr_poll = Mock()
        self.star._start_poll = Mock()
        normal = FakeEvent("#qqm登录", group="", admin=True)
        await self.star.start_webqr_login(normal)
        images = [c for msg in normal.sent for c in msg.chain if isinstance(c, C.Image)]
        self.assertEqual(len(images), 1)
        path = Path(await images[0].convert_to_file_path())
        self.assertEqual(path.read_bytes(), base64.b64decode(self.qq_qr))
        self.assertEqual([p for _, p, _, _ in self.calls], ["/login/webqr"])
        self.only_wx_fixture = True
        missing = FakeEvent("#qqm登录", group="", admin=True)
        await self.star.start_webqr_login(missing)
        self.assertIn("没有收到 QQ 登录二维码", missing.text)
        self.assertEqual(self.star._start_webqr_poll.call_count, 1)
        wx = FakeEvent("#qqm登录微信", group="", admin=True)
        await self.star.start_qr_login(wx)
        self.assertEqual(self.calls[-1][1], "/login/qr")
        self.star._start_poll.assert_called_once()

    async def test_ticket_and_account_permission(self):
        e = FakeEvent("#qqm演出 城市=北京")
        await self.star.migrated_commands(e)
        self.assertIn("测试演出", e.text)
        detail = FakeEvent("#qqm演出详情1")
        await self.star.migrated_commands(detail)
        self.assertIn("测试场馆", detail.text)
        for event in (FakeEvent("#qqm歌单新建 测试 确认"),
                      FakeEvent("#qqm歌单新建 测试 确认", group="", admin=False),
                      FakeEvent("#qqm歌单新建 测试", group="", admin=True)):
            await self.star.migrated_commands(event)
        self.assertFalse(any(p == "/songlist/create" for _, p, _, _ in self.calls))
        authorized = FakeEvent("#qqm歌单新建 测试 确认", group="", admin=True)
        await self.star.migrated_commands(authorized)
        self.assertTrue(any(p == "/songlist/create" for _, p, _, _ in self.calls))

    async def test_adapter_profiles_and_fallback(self):
        self.assertGreaterEqual(len(transport.MEDIA), 19)
        with tempfile.NamedTemporaryFile(dir=self.tmp.name) as tmp:
            for name, caps in transport.MEDIA.items():
                ev = FakeEvent(platform=name)
                i = C.Image.fromFileSystem(tmp.name)
                await transport.send_chain(ev, C.Plain("ok"), i)
                self.assertEqual(len(ev.sent[0].chain), 2, name)
                for cap, part in (
                    ("record", C.Record.fromFileSystem(tmp.name)),
                    ("video", C.Video.fromFileSystem(tmp.name)),
                    ("file", C.File("test", file=tmp.name)),
                ):
                    if cap in caps:
                        await transport.send_chain(ev, part)
                    else:
                        with self.assertRaises(transport.DeliveryError, msg=name):
                            await transport.send_chain(ev, part)
        unknown = FakeEvent("#qqm播放 demo", platform="third_party")
        await self.star.play_direct(unknown)
        self.assertIn("此会话无法发送音频", unknown.text)
        self.assertIn("https://y.qq.com/", unknown.text)
        self.assertFalse(any(p == "/audio" for _, p, _, _ in self.calls))

    async def test_onebot_peer_binding(self):
        call = AsyncMock(return_value={"retcode": 0})
        e = FakeEvent(platform="aiocqhttp", group="12345", bot=SimpleNamespace(call_action=call))
        await transport.onebot(e, "send_group_msg", {"group_id": 99999,
                             "message": [{"type": "music", "data": {"type": "qq", "id": "42"}}]})
        self.assertEqual(call.call_args.kwargs["group_id"], 12345)
        with self.assertRaises(transport.DeliveryError):
            await transport.onebot(e, "send_packet", {})

    async def test_download_content_and_cleanup(self):
        result = await delivery.download_audio(self.base + "/audio", self.tmp.name, "test")
        self.assertEqual(Path(result["filePath"]).suffix, ".wav")
        with self.assertRaises(RuntimeError):
            await delivery.download_audio(self.base + "/bad", self.tmp.name, "bad")
        self.assertFalse(list(Path(self.tmp.name).glob("*.part")))

    async def test_file_upload_falls_back_to_onebot_upload_action(self):
        self.config.update(
            sendVocal=False,
            uploadFile=True,
            sendTextInfo=False,
            renderListCard=False,
            keepFileSec=0,
        )
        event = FakeEvent("", platform="aiocqhttp", group="12345")
        song = {
            "songmid": "testMID001",
            "songName": "文件测试",
            "singerName": "歌手",
            "interval": 1,
            "source": "qq",
        }
        play = {"url": self.base + "/audio", "quality": "128", "raw": {}, "userKey": "u"}
        calls = []

        async def fake_onebot(ev, action, params):
            calls.append((action, params))
            return {"retcode": 0}

        with patch.object(delivery, "onebot", side_effect=fake_onebot), patch.object(
            self.star, "_send_chain", AsyncMock(side_effect=RuntimeError("file segment unsupported"))
        ):
            result = await delivery.deliver_song(
                self.star,
                event,
                song,
                play,
                cfg=self.config,
                plugin_dir=self.tmp.name,
            )
        self.assertTrue(result["ok"])
        self.assertEqual(calls[0][0], "upload_group_file")
        self.assertTrue(calls[0][1]["file"].endswith(".wav"))

    async def test_local_audio_retries_official_without_writing(self):
        e = FakeEvent()
        song = {"songmid": "testMID001", "songName": "本地曲", "interval": 1, "source": "qq", "libraryId": "lib_demo"}
        play = await self.star._resolve_play(song, self.star._cfg(), self.star._user_key(e))
        result = await delivery.deliver_song(self.star, e, song, play, cfg=self.star._cfg(), plugin_dir=self.tmp.name)
        self.assertTrue(result["ok"])
        queries = [d for m, p, d, _ in self.calls if p == "/song/url"]
        self.assertEqual(len(queries), 1)
        self.assertEqual(queries[0]["local"], "0")
        self.assertEqual(queries[0]["fresh"], "1")
        self.assertFalse(any(m == "POST" for m, _, _, _ in self.calls))

    async def test_scheduled_delivery_uses_umo_and_runs_once(self):
        e = FakeEvent("#qqm定时", group="scheduler_group", admin=True)
        e.message_str += f" {datetime.now():%H:%M} 定时测试曲"
        await self.star.migrated_commands(e)
        self.assertIn("任务已保存", e.text)
        await self.star._run_jobs()
        after_first = self.star.context.send_message.await_count
        self.assertGreater(after_first, 0)
        self.assertEqual(self.star.context.send_message.await_args.args[0], e.unified_msg_origin)
        await self.star._run_jobs()
        self.assertEqual(self.star.context.send_message.await_count, after_first)

    async def test_share_boundaries(self):
        e = FakeEvent()
        e.message_obj.raw_message = {"message": [{"type": "json", "data": {"app": "com.tencent.qqmusic",
                                   "meta": {"music": {"title": "测试曲", "jumpUrl": "https://y.qq.com/"}}}}]}
        self.assertTrue(main.MusicShares().filter(e, {}))
        self.assertIsNotNone(main.qqapi.parse_qqmusic_card(main._collect_message_text(e)))
        self.assertIsNone(features.external_ref("https://open.spotify.com.evil.invalid/track/0123456789012345678901"))
        self.assertEqual(features.external_ref("spotify:track:0123456789012345678901")[:2], ("spotify", "track"))

    async def test_unload(self):
        task = self.star._jobs
        self.assertFalse(task.done())
        await self.star.terminate()
        self.assertTrue(task.cancelled())
        self.assertIsNone(main.qqapi._session)

    async def test_library_web_helpers_and_job(self):
        item = library_web._public_item({
            "id": "lib_abc123",
            "songmid": "003abc",
            "title": "晴天",
            "artist": "周杰伦",
            "album": "叶惠美",
            "duration": 269,
            "quality": "flac",
            "source": "qq",
            "cover": "https://example.invalid/cover.jpg",
            "bytes": 1234,
            "filePresent": True,
            "status": "ok",
        })
        self.assertEqual(item["id"], "lib_abc123")
        self.assertEqual(item["title"], "晴天")
        self.assertTrue(item["available"])
        self.assertFalse(library_web._public_item({
            "id": "lib_missing", "filePresent": False, "status": "missing"
        })["available"])
        groups = library_web._normalize_groups([
            {"group_id": 123, "group_name": "测试群"},
            {"group_id": "123", "group_name": "重复群"},
            {"group_id": 456, "group_name": "另一个群"},
        ])
        self.assertEqual({row["group_id"] for row in groups}, {"123", "456"})
        targets = library_web._valid_targets(
            [{"platform": "aiocqhttp", "support_proactive": True}],
            [
                {"platform": "aiocqhttp", "group_id": "123", "name": "测试群"},
                {"platform": "aiocqhttp", "group_id": "123", "name": "重复"},
                {"platform": "unknown", "group_id": "999"},
            ],
        )
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0]["umo"], "aiocqhttp:GroupMessage:123")
        song, play = library_web._song_and_play({
            "id": "lib_abc123", "songmid": "003abc", "title": "晴天",
            "artist": "周杰伦", "album": "叶惠美", "duration": 269,
            "quality": "flac", "source": "qq", "fileUrl": "http://127.0.0.1/library/file?id=lib_abc123",
        }, "master")
        self.assertEqual(song["libraryId"], "lib_abc123")
        self.assertTrue(play["local"])
        self.assertEqual(play["userKey"], "master")

        fake = SimpleNamespace(
            context=SimpleNamespace(),
            _data_dir=self.tmp.name,
            _cfg=lambda: self.config,
            _library_jobs={},
            _library_tasks=set(),
            _log_warn=lambda text: None,
        )
        job = {
            "id": "libjob_test",
            "ids": ["lib_abc123"],
            "targets": targets,
            "userKey": "master",
            "status": "queued",
            "total": 1,
            "done": 0,
            "results": [],
            "error": "",
            "startedAt": 0,
            "finishedAt": 0,
        }
        fake._library_jobs[job["id"]] = job
        with unittest.mock.patch.object(
            library_web, "_fetch_item", AsyncMock(return_value={
                "id": "lib_abc123", "songmid": "003abc", "title": "晴天",
                "artist": "周杰伦", "duration": 269, "quality": "flac",
                "source": "qq", "fileUrl": "http://127.0.0.1/library/file?id=lib_abc123",
            })
        ), unittest.mock.patch.object(
            library_web, "deliver_song", AsyncMock(return_value={"ok": True, "reason": "voice"})
        ):
            await library_web._run_job(fake, job)
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["done"], 1)
        self.assertTrue(job["results"][0]["ok"])

    async def test_real_python_renderer(self):
        e = FakeEvent("#qqm演出")
        self.config.update(renderListCard=True, renderCover=False)
        rendered = await asyncio.gather(self.star._render_card(e, {"title": "票务·测试", "rows": ["中文标题"]}, "summary"),
                                       self.star._render_card(e, {"title": "票务·并发", "rows": ["第二张"]}, "summary"))
        self.assertTrue(all(rendered))
        self.assertNotEqual(rendered[0], rendered[1])
        for path in rendered:
            self.assertTrue(Path(path).read_bytes().startswith(b"\xff\xd8\xff"))
        help_data = main.cardlib.build_help_card_data(self.config, "2.1.23")
        path = await self.star._render_card(e, help_data, "qqmusic-help")
        self.assertTrue(path and Path(path).stat().st_size > 4096)
        with PillowImage.open(path) as preview:
            self.assertEqual(preview.format, "JPEG")
            self.assertGreater(preview.height, 1000)
            preview.verify()

    async def test_all_card_layouts_offline_and_png_theme(self):
        e = FakeEvent("#qqm帮助")
        self.config.update(renderListCard=True, imageFormat="png", uiTheme="nebula")
        shapes = {
            "list": {"keyword": "中文列表", "total": 1, "songs": [{"songName": "一首歌", "singerName": "歌手", "hasMv": True}]},
            "hot": {"items": [{"word": "中文热搜"}]},
            "detail": {"songName": "音乐详情", "singerName": "歌手", "source": "MV", "cover": "https://example.invalid/no-fetch"},
            "lyric": {"songName": "歌词", "lines": ["一个句子", "第二个句子"]},
            "poster": {"songName": "海报", "lines": ["句子"]},
            "comment": {"songName": "评论", "comments": [{"nick": "昵称", "content": "新评论"}]},
            "status": {"title": "状态", "loggedIn": False, "loginTypeText": "未登录"},
            "settings": {"title": "设置", "rows": [{"k": "音质", "v": "无损"}]},
        }
        results = await asyncio.gather(*(self.star._render_card(e, v, f"qqmusic-{k}") for k, v in shapes.items()))
        self.assertTrue(all(results))
        for path in results:
            with PillowImage.open(path) as im:
                self.assertEqual(im.format, "PNG")
                # HTML 主题卡片按 3x DPR 截图（Pillow 回退为 960 宽）
                self.assertGreaterEqual(im.width, 960)
                self.assertEqual(im.width % 3, 0)
                self.assertLessEqual(im.height, 4800)
                self.assertLessEqual(im.width * im.height, 8_000_000)
                im.verify()
        self.config["uiDark"] = "深色"
        path = await self.star._render_card(e, shapes["detail"], "qqmusic-detail")
        with PillowImage.open(results[2]) as light, PillowImage.open(path) as dark:
            self.assertNotEqual(light.getpixel((0, 0)), dark.getpixel((0, 0)))


if __name__ == "__main__":
    unittest.main()
