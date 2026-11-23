"""Run AstrBot's actual plugin manager against the unpacked release."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from zipfile import ZipFile


async def smoke():
    from astrbot import __version__
    from astrbot.core import astrbot_config, db_helper, sp
    from astrbot.core.star.star import star_map
    from astrbot.core.star.star_handler import star_handlers_registry
    from astrbot.core.star.star_manager import PluginManager
    from astrbot.dashboard.services.plugin_service import PluginService

    assert __version__ == "4.29.4"
    await db_helper.initialize()
    await sp.initialize()
    manager = PluginManager(SimpleNamespace(get_all_stars=lambda: tuple(star_map.values())), astrbot_config)
    name = "astrbot_plugin_qqmusic"
    module = f"data.plugins.{name}.main"
    try:
        ok, error = await manager.load(specified_dir_name=name)
        assert ok, error
        loaded = star_map[module]
        first = loaded.star_cls
        from data.plugins.astrbot_plugin_qqmusic.updater import get_local_version

        assert "v" + get_local_version(Path(loaded.module.__file__).parent) == loaded.version
        assert loaded.short_desc and "多音源点歌" in loaded.short_desc
        dashboard = PluginService(None, manager)
        changelog, _ = dashboard.get_plugin_changelog(name)
        assert f"## {loaded.version}" in changelog["content"]
        assert first.config["apiBase"] == "http://127.0.0.1:3300"
        assert first._jobs and not first._jobs.done()
        plugin_dir = Path(loaded.module.__file__).parent
        assert (plugin_dir / "views" / "library" / "index.html").is_file()
        assert (plugin_dir / "views" / "library" / "bridge.js").is_file()
        assert (plugin_dir / "resources" / "themes" / "classic" / "qqmusic-poster.html").is_file()
        assert (plugin_dir / ".astrbot-plugin" / "i18n" / "zh-CN.json").is_file()
        handlers = star_handlers_registry.get_handlers_by_module_name(module)
        assert any(h.handler_name == "pick_song" for h in handlers)
        messages = []

        class HelpEvent:
            message_str = "#qqm帮助"
            unified_msg_origin = "webchat:FriendMessage:smoke"

            def get_platform_name(self):
                return "webchat"

            async def send(self, chain):
                messages.extend(chain.chain)

            def stop_event(self):
                pass

        first.config["renderListCard"] = False
        await next(h for h in handlers if h.handler_name == "help").handler(HelpEvent())
        assert any("QQ音乐插件帮助" in getattr(c, "text", "") for c in messages)
        messages.clear()
        event = HelpEvent()
        event.message_str = "#qqm更新日志"
        with patch("asyncio.create_subprocess_exec", side_effect=AssertionError("changelog requires git")):
            await next(h for h in handlers if h.handler_name == "update_log").handler(event)
        text = "\n".join(getattr(c, "text", "") for c in messages)
        assert loaded.version in text and "三端内容与版本同步" in text
        print(f"Dashboard changelog + ZIP update command + short description OK | {loaded.version}", flush=True)
        if output := os.environ.get("QQMUSIC_SMOKE_PREVIEW"):
            from astrbot.api.message_components import Image

            first.config["renderListCard"] = True
            messages.clear()
            with patch("asyncio.create_subprocess_exec", side_effect=AssertionError("renderer tried to spawn a process")):
                await next(h for h in handlers if h.handler_name == "help").handler(HelpEvent())
            preview = next(c for c in messages if isinstance(c, Image))
            image = Path(await preview.convert_to_file_path()).read_bytes()
            assert image[:3] == b"\xff\xd8\xff"
            Path(output).write_bytes(image)
            print(f"Bundled local Pillow help JPEG: {len(image)} bytes", flush=True)
        ok, error = await manager.reload(name)
        assert ok, error
        second = star_map[module].star_cls
        assert first._jobs.cancelled() and second is not first and not second._jobs.done()
        print(f"SDK {__version__} | ZIP load + help dispatch + reload OK | {len(handlers)} handlers", flush=True)
    finally:
        if module in star_map and star_map[module].star_cls:
            await star_map[module].star_cls.terminate()
        await sp.close()
        await db_helper.engine.dispose()


def main(argv):
    package = Path(argv[1]).resolve()
    checkout = Path(__file__).resolve().parents[1]
    (checkout / "temp").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="astrbot-package-", dir=checkout / "temp") as runtime:
        root = Path(runtime)
        plugins = root / "data" / "plugins"
        plugins.mkdir(parents=True)
        (root / "data" / "config").mkdir()
        with ZipFile(package) as archive:
            for member in archive.namelist():
                target = (plugins / member).resolve()
                if not target.is_relative_to(plugins):
                    raise ValueError(member)
            archive.extractall(plugins)
        os.environ["ASTRBOT_ROOT"] = runtime
        sys.path.insert(0, runtime)
        asyncio.run(smoke())


if __name__ == "__main__":
    main(sys.argv)
