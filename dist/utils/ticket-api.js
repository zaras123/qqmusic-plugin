import { request } from './api.js';
function payload(body) {
    if (!body || body.result !== 100 || !body.data || typeof body.data !== 'object') {
        throw new Error('Invalid ticket response');
    }
    return body.data;
}
export async function ticketArchive(filters, userKey = '', { timeout = 45000 } = {}) {
    const d = payload(await request('/ticket/archive', filters, 'get', userKey, { timeout }));
    const total = Number(d.total);
    const page = Number(d.page);
    const pageSize = Number(d.pageSize);
    if (!Array.isArray(d.list) || !Number.isFinite(total) || total < 0) {
        throw new Error('Invalid ticket archive');
    }
    // 兼容旧版 API：分页信息缺失时按本次请求补默认值，不让同步后的预览把整条命令带崩。
    return {
        ...d,
        total: Math.trunc(total),
        page: Number.isSafeInteger(page) && page > 0 ? page : 1,
        pageSize: Number.isSafeInteger(pageSize) && pageSize > 0
            ? pageSize
            : (Number(filters?.pageSize) || 6),
    };
}
export async function ticketShow(key, userKey = '') {
    const d = payload(await request('/ticket/show', { id: key }, 'get', userKey));
    if (!d.key || !d.name)
        throw new Error('Invalid ticket show');
    return d;
}
export async function ticketOptions(kind, userKey = '') {
    const d = payload(await request(kind === 'cities' ? '/ticket/cities' : '/ticket/categories', {}, 'get', userKey));
    const list = kind === 'cities' ? d.cities : d.list;
    if (!Array.isArray(list))
        throw new Error('Invalid ticket options');
    return list;
}
export async function ticketSync(city, userKey = '', { detailLimit = 80 } = {}) {
    return payload(await request('/ticket/sync', { city, limit: 1, detailLimit }, 'post', userKey, { timeout: 180000 }));
}
//# sourceMappingURL=ticket-api.js.map