"""Focused tests for the local-library WebUI without browser/Pillow dependencies."""
from __future__ import annotations

import importlib
import importlib.util
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get("ASTRBOT_ROOT"):
    runtime = ROOT / "temp" / "astrbot-tests"
    runtime.mkdir(parents=True, exist_ok=True)
    os.environ["ASTRBOT_ROOT"] = str(runtime)

NAME = "astrbot_plugin_qqmusic"
if NAME not in sys.modules:
    spec = importlib.util.spec_from_file_location(
        NAME, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)]
    )
    package = importlib.util.module_from_spec(spec)
    sys.modules[NAME] = package
    spec.loader.exec_module(package)

library_web = importlib.import_module(f"{NAME}.library_web")


class LibraryWebTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_routes(self):
        class FakeContext:
            def __init__(self):
                self.routes = []

            def register_web_api(self, route, handler, methods, desc):
                self.routes.append((route, methods, desc))

        context = FakeContext()
        library_web.register_web_api(SimpleNamespace(context=context))
        self.assertEqual(
            [route for route, _, _ in context.routes],
            [
                f"/{library_web.PLUGIN_NAME}/library/groups",
                f"/{library_web.PLUGIN_NAME}/library/search",
                f"/{library_web.PLUGIN_NAME}/library/send",
                f"/{library_web.PLUGIN_NAME}/library/job",
            ],
        )

    async def test_public_item_and_targets(self):
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

    async def test_job_reports_success(self):
        fake = SimpleNamespace(
            context=SimpleNamespace(),
            _data_dir=str(ROOT / "temp"),
            _cfg=lambda: {},
            _library_jobs={},
            _library_tasks=set(),
            _log_warn=lambda text: None,
        )
        job = {
            "id": "libjob_test",
            "ids": ["lib_abc123"],
            "targets": [{
                "platform": "aiocqhttp",
                "group_id": "123",
                "name": "测试群",
                "umo": "aiocqhttp:GroupMessage:123",
            }],
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
        with patch.object(
            library_web,
            "_fetch_item",
            AsyncMock(return_value={
                "id": "lib_abc123",
                "songmid": "003abc",
                "title": "晴天",
                "artist": "周杰伦",
                "duration": 269,
                "quality": "flac",
                "source": "qq",
                "fileUrl": "http://127.0.0.1/library/file?id=lib_abc123",
            }),
        ), patch.object(
            library_web,
            "deliver_song",
            AsyncMock(return_value={"ok": True, "reason": "voice"}),
        ):
            await library_web._run_job(fake, job)
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["done"], 1)
        self.assertTrue(job["results"][0]["ok"])


if __name__ == "__main__":
    unittest.main()
