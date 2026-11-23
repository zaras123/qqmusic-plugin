"""Local-library WebUI: search the API library and push selected songs to groups."""

from __future__ import annotations

import asyncio
import inspect
import os
import re
import time
from urllib.parse import urlsplit
from uuid import uuid4

from astrbot.api import logger
from astrbot.api.web import error_response, json_response, request

from . import api as qqapi
from .astrbot_transport import ProactiveEvent
from .delivery import deliver_song

PLUGIN_NAME = "astrbot_plugin_qqmusic"
ROUTE = f"/{PLUGIN_NAME}/library"

_ID_RE = re.compile(r"^lib_[A-Za-z0-9]+$")
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_MAX_ITEMS = 50
_MAX_TARGETS = 100
_KEEP_JOBS = 20


def _play_user_key(plugin) -> str:
    cfg = plugin._cfg()
    return str(cfg.get("publicAccount") or cfg.get("lastLoginUserKey") or "")


def _has_api_token(plugin) -> bool:
    cfg = plugin._cfg()
    token = qqapi._token_from_cfg(cfg) or os.environ.get("QQMUSIC_API_TOKEN") or ""
    return bool(str(token).strip())


def _token_required():
    return error_response(
        "TOKEN_REQUIRED: 还没有配置 API Token，请先在插件设置里填写后再使用",
        status_code=409,
        data={"code": "TOKEN_REQUIRED"},
    )


def _valid_api_base(value: str) -> bool:
    if not value:
        return True
    if re.search(r"\s", value):
        return False
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme in {"http", "https"}
            and bool(parsed.hostname)
            and not parsed.username
            and not parsed.password
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False


async def _maybe_await(value):
    return await value if inspect.isawaitable(value) else value


def _public_item(raw: dict) -> dict:
    status = str(raw.get("status") or "")
    available = raw.get("filePresent") is not False and status not in {"missing", "quarantined"}
    return {
        "id": str(raw.get("id") or ""),
        "songmid": str(raw.get("songmid") or ""),
        "title": str(raw.get("title") or raw.get("songName") or raw.get("songmid") or "未知歌曲"),
        "artist": str(raw.get("artist") or raw.get("singerName") or "未知歌手"),
        "album": str(raw.get("album") or ""),
        "duration": max(0, int(raw.get("duration") or 0)),
        "quality": str(raw.get("quality") or ""),
        "source": str(raw.get("source") or ""),
        "cover": str(raw.get("cover") or ""),
        "bytes": max(0, int(raw.get("bytes") or 0)),
        "available": available,
        "status": status,
        "playCount": max(0, int(raw.get("playCount") or 0)),
        "addedAt": int(raw.get("addedAt") or 0),
    }


def _group_field(row, *names):
    for name in names:
        try:
            value = row.get(name) if isinstance(row, dict) else getattr(row, name, None)
        except Exception:
            continue
        if value not in (None, ""):
            return value
    return None


def _as_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _normalize_groups(value) -> list[dict]:
    if isinstance(value, dict):
        for key in ("data", "groups", "list"):
            inner = value.get(key)
            if isinstance(inner, (list, tuple, dict)):
                value = inner
                break
        else:
            # icqq 的 get_group_list() 返回 {群号: Group}；其他适配器也可能是 map。
            value = list(value.values())
    if isinstance(value, dict):
        value = list(value.values())
    if not isinstance(value, (list, tuple)):
        return []
    out = []
    seen = set()
    for row in value:
        if row is None or isinstance(row, (str, bytes, int, float, bool)):
            continue
        gid = _group_field(row, "group_id", "groupId", "gid", "id")
        gid = str(gid if gid is not None else "").strip()
        if not gid or gid in seen:
            continue
        seen.add(gid)
        name = _group_field(row, "group_name", "groupName", "name", "remark") or gid
        out.append({
            "group_id": gid,
            "name": str(name),
            "member_count": _as_int(_group_field(row, "member_count", "memberCount", "member_num")),
            "active_member_count": _as_int(
                _group_field(row, "active_member_count", "activeMemberCount")
            ),
        })
    return sorted(out, key=lambda x: (x["name"].casefold(), x["group_id"]))

async def _fetch_groups(platform) -> tuple[list[dict], str]:
    try:
        client = platform.get_client()
    except Exception as exc:
        return [], f"无法读取适配器客户端：{type(exc).__name__}"
    if not client:
        return [], "适配器尚未连接"
    candidates = [client, getattr(client, "api", None)]
    for source in candidates:
        if source is None:
            continue
        fn = getattr(source, "get_group_list", None)
        if callable(fn):
            try:
                return _normalize_groups(await _maybe_await(fn())), ""
            except Exception as exc:
                return [], f"读取群列表失败：{type(exc).__name__}"
        call = getattr(source, "call_action", None)
        if callable(call):
            try:
                return _normalize_groups(
                    await _maybe_await(call("get_group_list"))
                ), ""
            except Exception as exc:
                return [], f"读取群列表失败：{type(exc).__name__}"
    return [], "适配器未提供群列表，可在页面里手动填写群号"


async def _platforms(plugin) -> list[dict]:
    manager = getattr(plugin.context, "platform_manager", None)
    if manager is None:
        return []
    try:
        insts = manager.get_insts()
    except Exception:
        insts = getattr(manager, "platform_insts", [])
    out = []
    for platform in insts or []:
        try:
            meta = platform.meta()
        except Exception:
            continue
        groups, error = await _fetch_groups(platform)
        out.append({
            "platform": str(meta.id),
            "name": str(meta.adapter_display_name or meta.name or meta.id),
            "uin": "",
            "groups": groups,
            "error": error,
            "support_proactive": bool(getattr(meta, "support_proactive_message", True)),
        })
    return out


def _valid_targets(platform_rows: list[dict], rows) -> list[dict]:
    allowed = {row["platform"] for row in platform_rows if row.get("support_proactive")}
    if not isinstance(rows, list):
        return []
    out = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        platform = str(row.get("platform") or "").strip()
        group_id = str(row.get("group_id") or row.get("groupId") or "").strip()
        if platform not in allowed or not _SAFE_ID_RE.fullmatch(group_id):
            continue
        key = (platform, group_id)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "platform": platform,
            "group_id": group_id,
            "name": str(row.get("name") or group_id)[:80],
            "umo": f"{platform}:GroupMessage:{group_id}",
        })
    return out[: _MAX_TARGETS]


def _song_and_play(item: dict, user_key: str) -> tuple[dict, dict]:
    item_id = str(item.get("id") or "")
    songmid = str(item.get("songmid") or item_id)
    source = str(item.get("source") or "library")
    song = {
        "songmid": songmid,
        "songName": str(item.get("title") or songmid),
        "singerName": str(item.get("artist") or "未知歌手"),
        "albumName": str(item.get("album") or ""),
        "interval": max(0, int(item.get("duration") or 0)),
        "cover": str(item.get("cover") or ""),
        "source": source,
        "local": True,
        "libraryId": item_id,
    }
    play = {
        **item,
        "url": str(item.get("fileUrl") or ""),
        "quality": str(item.get("quality") or "本地"),
        "qualityLabel": str(item.get("quality") or "本地曲库"),
        "local": True,
        "libraryId": item_id,
        "userKey": user_key,
        "raw": {"local": True, "libraryId": item_id},
    }
    return song, play


async def _fetch_item(plugin, item_id: str, user_key: str) -> dict:
    data = qqapi.unwrap_data(
        await qqapi.request(
            "/library/item", {"id": item_id}, user_key=user_key, shared=True
        )
    )
    if not isinstance(data, dict) or data.get("id") != item_id or not data.get("fileUrl"):
        raise RuntimeError("曲库记录不可用或文件已缺失")
    return data


def _prune_jobs(plugin):
    jobs = plugin._library_jobs
    if len(jobs) <= _KEEP_JOBS:
        return
    finished = [
        (job.get("finishedAt") or job.get("startedAt") or 0, key)
        for key, job in jobs.items()
        if job.get("status") not in {"queued", "running"}
    ]
    for _, key in sorted(finished)[: len(jobs) - _KEEP_JOBS]:
        jobs.pop(key, None)


def _public_job(job: dict) -> dict:
    return {
        "id": job["id"],
        "status": job.get("status"),
        "total": int(job.get("total") or 0),
        "done": int(job.get("done") or 0),
        "startedAt": job.get("startedAt"),
        "finishedAt": job.get("finishedAt"),
        "error": job.get("error") or "",
        "results": list(job.get("results") or [])[-200:],
    }


async def _run_job(plugin, job: dict):
    job["status"] = "running"
    job["startedAt"] = time.time()
    user_key = job["userKey"]
    try:
        for item_id in job["ids"]:
            try:
                item = await _fetch_item(plugin, item_id, user_key)
            except Exception as exc:
                for target in job["targets"]:
                    job["results"].append({
                        "itemId": item_id,
                        "title": item_id,
                        "platform": target["platform"],
                        "groupId": target["group_id"],
                        "groupName": target["name"],
                        "ok": False,
                        "reason": f"读取曲库失败：{type(exc).__name__}",
                    })
                    job["done"] += 1
                continue
            song, play = _song_and_play(item, user_key)
            for target in job["targets"]:
                result = {
                    "itemId": item_id,
                    "title": song["songName"],
                    "artist": song["singerName"],
                    "platform": target["platform"],
                    "groupId": target["group_id"],
                    "groupName": target["name"],
                    "ok": False,
                    "reason": "",
                }
                try:
                    event = ProactiveEvent(
                        plugin.context,
                        target["umo"],
                        user_key,
                        target["platform"],
                    )
                    sent = await deliver_song(
                        plugin,
                        event,
                        song,
                        play,
                        cfg=plugin._cfg(),
                        plugin_dir=str(plugin._data_dir),
                    )
                    result["ok"] = bool(sent.get("ok"))
                    result["reason"] = str(sent.get("reason") or "")
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    result["reason"] = f"{type(exc).__name__}: {exc}"[:200]
                job["results"].append(result)
                job["done"] += 1
        job["status"] = "done"
    except asyncio.CancelledError:
        job["status"] = "cancelled"
        raise
    except Exception as exc:
        job["status"] = "error"
        job["error"] = f"{type(exc).__name__}: {exc}"[:300]
        plugin._log_warn(f"曲库 WebUI 发送任务失败：{type(exc).__name__}")
    finally:
        job["finishedAt"] = time.time()


async def _groups_handler(plugin):
    rows = await _platforms(plugin)
    return json_response({"platforms": rows})


async def _search_handler(plugin):
    if plugin._cfg().get("localLibrary", True) is False:
        return error_response("本地曲库开关已关闭", status_code=400)
    if not _has_api_token(plugin):
        return _token_required()
    q = str(request.query.get("q", "") or "").strip()
    try:
        limit = max(1, min(200, int(request.query.get("limit", 30) or 30)))
    except (TypeError, ValueError):
        limit = 30
    try:
        body = await qqapi.request(
            "/library/list",
            {"q": q, "limit": limit, "offset": 0},
            "get",
            _play_user_key(plugin),
        )
        data = qqapi.unwrap_data(body)
        raw_items = data.get("items") if isinstance(data, dict) else []
        items = [
            _public_item(item)
            for item in (raw_items or [])
            if isinstance(item, dict) and _ID_RE.fullmatch(str(item.get("id") or ""))
        ]
        return json_response({
            "q": q,
            "query": q,
            "items": items,
            "total": int(data.get("total") or len(items)) if isinstance(data, dict) else len(items),
        })
    except Exception as exc:
        logger.warning(f"[qqmusic] 曲库搜索失败：{type(exc).__name__}")
        return error_response(f"搜索本地曲库失败：{exc}", status_code=502)


async def _send_handler(plugin):
    if plugin._cfg().get("localLibrary", True) is False:
        return error_response("本地曲库开关已关闭", status_code=400)
    if not _has_api_token(plugin):
        return _token_required()
    payload = await request.json(default={})
    if not isinstance(payload, dict):
        return error_response("请求体必须是 JSON 对象", status_code=400)
    ids = [
        str(value)
        for value in (payload.get("ids") or [])
        if _ID_RE.fullmatch(str(value))
    ]
    ids = list(dict.fromkeys(ids))[: _MAX_ITEMS]
    if not ids:
        return error_response("请选择至少一首本地曲库歌曲", status_code=400)
    rows = await _platforms(plugin)
    targets = _valid_targets(rows, payload.get("targets"))
    if not targets:
        return error_response("请选择至少一个有效群聊", status_code=400)
    running = any(
        job.get("status") in {"queued", "running"}
        for job in plugin._library_jobs.values()
    )
    if running:
        return error_response("已有曲库发送任务在运行，请等它完成", status_code=409)
    job = {
        "id": f"libjob_{uuid4().hex[:12]}",
        "ids": ids,
        "targets": targets,
        "userKey": _play_user_key(plugin),
        "status": "queued",
        "total": len(ids) * len(targets),
        "done": 0,
        "results": [],
        "error": "",
        "startedAt": 0,
        "finishedAt": 0,
    }
    plugin._library_jobs[job["id"]] = job
    _prune_jobs(plugin)
    task = asyncio.create_task(_run_job(plugin, job))
    plugin._library_tasks.add(task)
    task.add_done_callback(plugin._library_tasks.discard)
    return json_response({
        "jobId": job["id"],
        "total": job["total"],
        "songs": len(ids),
        "groups": len(targets),
    })


async def _job_handler(plugin):
    job_id = str(request.query.get("id", "") or "")
    job = plugin._library_jobs.get(job_id)
    if not job:
        return error_response("没有这个发送任务", status_code=404)
    return json_response(_public_job(job))


async def _api_config_handler(plugin):
    if str(getattr(request, "method", "GET")).upper() == "POST":
        payload = await request.json(default={})
        if not isinstance(payload, dict):
            return error_response("请求体必须是 JSON 对象", status_code=400)
        api_base = qqapi.normalize_api_base(payload.get("apiBase"))
        if not _valid_api_base(api_base):
            return error_response(
                "API 地址格式不正确，请填写 http/https 地址或裸域名",
                status_code=400,
            )
        plugin.config["apiBase"] = api_base
        plugin.config["apiToken"] = str(payload.get("apiToken") or "").strip()
        save = getattr(plugin.config, "save_config", None)
        if callable(save):
            save()
        return json_response({"message": "API 配置已保存"})
    cfg = plugin._cfg()
    return json_response({
        "apiBase": qqapi.normalize_api_base(cfg.get("apiBase")),
        "apiToken": qqapi._token_from_cfg(cfg),
        "hasToken": _has_api_token(plugin),
    })


def register_web_api(plugin):
    register = getattr(plugin.context, "register_web_api", None)
    if not callable(register):
        # Unit-test / old host contexts may not expose the WebUI registrar.
        return
    register(
        f"{ROUTE}/groups", lambda: _groups_handler(plugin), ["GET"],
        "List connected platforms and groups",
    )
    register(
        f"{ROUTE}/search", lambda: _search_handler(plugin), ["GET"],
        "Search the API local music library",
    )
    register(
        f"{ROUTE}/send", lambda: _send_handler(plugin), ["POST"],
        "Send selected local library songs to groups",
    )
    register(
        f"{ROUTE}/job", lambda: _job_handler(plugin), ["GET"],
        "Read a local library send job",
    )
    register(
        f"{ROUTE}/api-config", lambda: _api_config_handler(plugin), ["GET", "POST"],
        "Read or save the API base and token",
    )
