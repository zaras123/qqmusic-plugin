/** Karin 多适配器群列表：按 bot/账号汇总 getGroupList()。 */
import { botsListAsync } from './bridge.js';
import { detectAdapter } from './adapter.js';
function groupRowsOf(data) {
    if (Array.isArray(data))
        return data;
    if (Array.isArray(data?.data))
        return data.data;
    if (Array.isArray(data?.groups))
        return data.groups;
    return [];
}
/**
 * 返回 WebUI 直接可用的「适配器 → 群」结构。
 *
 * platform 里带账号，避免同一个适配器挂多个 bot 时 tab/选中状态互相覆盖；
 * uin 单独给出，发送时传回后端用于优先选择对应 bot。
 */
export async function listKarinPlatformGroups() {
    const out = [];
    for (const [uin, bot] of await botsListAsync()) {
        const adapter = detectAdapter({ bot });
        const kind = adapter.kind && adapter.kind !== 'unknown' ? adapter.kind : adapter.id || 'karin';
        const label = adapter.name && adapter.name !== adapter.kind ? adapter.name : kind;
        const kindLabel = kind === 'icqq' ? 'ICQQ' : kind === 'onebot' ? 'OneBot' : kind === 'qqbot' ? 'QQBot' : label;
        const platform = `${kind}:${uin}`;
        const row = {
            platform,
            name: `${kindLabel} · ${uin}`,
            uin,
            groups: [],
        };
        try {
            if (typeof bot?.getGroupList !== 'function') {
                row.error = `${label} 适配器没有提供群列表接口`;
            }
            else {
                const data = await bot.getGroupList(true);
                const seen = new Set();
                for (const group of groupRowsOf(data)) {
                    const id = String(group?.groupId ?? group?.group_id ?? group?.groupIdStr ?? group?.id ?? '').trim();
                    if (!id || seen.has(id))
                        continue;
                    seen.add(id);
                    row.groups.push({
                        group_id: id,
                        name: String(group?.groupName || group?.group_name || group?.name || id),
                        bot: uin,
                    });
                }
                row.groups.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            }
        }
        catch (err) {
            row.error = `${label} 读取群列表失败：${err?.message || String(err)}`;
        }
        out.push(row);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
export async function listKarinGroupOptions() {
    const out = [];
    for (const platform of await listKarinPlatformGroups()) {
        for (const group of platform.groups) {
            out.push({
                label: `${platform.name} · ${group.name}`,
                value: `karin:${platform.uin}|${group.group_id}`,
            });
        }
    }
    return out;
}
//# sourceMappingURL=group-targets.js.map