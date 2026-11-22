"""Read-only AstrBot release information; installation is managed by AstrBot."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path


_VERSION = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"
_VERSION_TITLE = re.compile(rf"^(?:v(?P<plain>{_VERSION})|\[v(?P<link>{_VERSION})\])(?:\s+-\s+\d{{4}}-\d{{2}}-\d{{2}})?$")


def get_local_version(plugin_dir):
    text = (Path(plugin_dir) / "metadata.yaml").read_text(encoding="utf8")
    value = re.search(r"^version:[ \t]*(.*)$", text, re.M)
    match = re.fullmatch(rf"v?({_VERSION})", value[1].split("#", 1)[0].strip().strip("\"'")) if value else None
    return match[1] if match else "unknown"


def read_release_sections(plugin_dir):
    text = (Path(plugin_dir) / "CHANGELOG.md").read_text(encoding="utf8")
    headers = list(re.finditer(r"^##[ \t]+(.+)$", text, re.M))
    sections = {}
    for index, header in enumerate(headers):
        match = _VERSION_TITLE.fullmatch(header[1].strip())
        if not match:
            continue
        version = match["plain"] or match["link"]
        end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
        notes = text[header.end():end].strip()
        if version in sections:
            raise ValueError(f"CHANGELOG.md 存在重复版本 v{version}。")
        if not notes:
            raise ValueError(f"CHANGELOG.md 中 v{version} 缺少更新内容。")
        sections[version] = notes
    return sections


def validate_release_notes(plugin_dir):
    root = Path(plugin_dir)
    version = get_local_version(root)
    sections = read_release_sections(root)
    if version == "unknown":
        raise ValueError("metadata.yaml 缺少有效的版本号。")
    if next(iter(sections), None) != version:
        raise ValueError(f"CHANGELOG.md 的第一条版本记录必须为 v{version}，与 metadata.yaml 一致。")
    metadata = (root / "metadata.yaml").read_text(encoding="utf8")
    short_desc = re.search(r"^short_desc:[ \t]*([^\r\n]*)$", metadata, re.M)
    if not short_desc or not short_desc[1].strip().strip("\"'") or short_desc[1].lstrip().startswith(("#", "|", ">")):
        raise ValueError("metadata.yaml 缺少一句话功能描述 short_desc。")
    return version


def _current_update_log(plugin_dir):
    try:
        version = get_local_version(plugin_dir)
        notes = read_release_sections(plugin_dir).get(version)
        if notes:
            if len(notes) > 1600:
                notes = notes[:1600].rsplit("\n", 1)[0] + "\n…（完整记录请查看 AstrBot 插件管理）"
            return {"message": f"QQ 音乐 · v{version} 更新日志\n\n{notes}"}
    except (OSError, ValueError):
        pass
    return {"message": "未找到当前版本的更新日志，请检查插件安装包。"}


async def get_update_log(plugin_dir):
    return await asyncio.to_thread(_current_update_log, plugin_dir)
