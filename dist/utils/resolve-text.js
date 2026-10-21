/**
 * QQ 音乐分享消息的文本提取与识别。
 *
 * Karin 的 JSON/XML 卡片通常只放在 `e.elements` 里，`e.msg` 和
 * `e.rawMessage` 可能都是空串；因此不能只看消息文本字段。
 */
function asText(value, parts) {
    if (value == null)
        return;
    if (typeof value === 'string') {
        if (value && !parts.includes(value))
            parts.push(value);
        return;
    }
    if (typeof value === 'object') {
        try {
            const text = JSON.stringify(value);
            if (text && !parts.includes(text))
                parts.push(text);
        }
        catch {
            /* 循环对象 / BigInt：忽略这一段 */
        }
    }
}
export function collectMessageText(e) {
    const parts = [];
    const push = (value) => asText(value, parts);
    push(e?.msg);
    push(e?.rawMessage);
    push(e?.raw_message);
    push(e?.raw);
    push(e?.raw?.content);
    push(e?.raw?.message);
    push(e?.raw?.d?.content);
    push(e?.raw?.d?.message);
    push(e?.raw?.d?.attachments);
    push(e?.attachments);
    const walkSeg = (seg) => {
        if (!seg)
            return;
        if (typeof seg === 'string') {
            push(seg);
            return;
        }
        if (Array.isArray(seg)) {
            for (const item of seg)
                walkSeg(item);
            return;
        }
        if (typeof seg !== 'object')
            return;
        if (seg.type === 'text')
            push(seg.text ?? seg.data?.text);
        if (seg.type === 'json')
            push(seg.data);
        if (seg.type === 'xml')
            push(seg.data);
        if (seg.type === 'share' || seg.type === 'music' || seg.type === 'ark') {
            push(seg);
            push(seg.data);
        }
        if (seg.type === 'markdown')
            push(seg.content ?? seg.data);
        if (seg.url)
            push(seg.url);
        if (seg.data) {
            push(seg.data);
            if (typeof seg.data === 'object') {
                push(seg.data.data);
                push(seg.data.text);
                push(seg.data.content);
                push(seg.data.url);
                push(seg.data.jumpUrl);
                push(seg.data.jump_url);
                push(seg.data.preview);
            }
        }
    };
    // Karin：结构化消息只在 elements；Yunzai / 旧事件仍可能给 message。
    walkSeg(e?.elements);
    walkSeg(e?.message);
    // 元素内容优先；没有结构化内容时，toString 才可能提供额外线索。
    if (!parts.length)
        push(e?.toString?.());
    return parts.join('\n');
}
export function isQQMusicMessage(text) {
    if (!text)
        return false;
    if (/y\.qq\.com|c6\.y\.qq\.com|i\.y\.qq\.com|qqmusic|QQ音乐/i.test(text))
        return true;
    if (/100497308/.test(text))
        return true;
    if (/com\.tencent\.(structmsg|music\.lua)/.test(text))
        return true;
    if (/sdkshare_music|songmid=|playsong\.html/i.test(text))
        return true;
    return false;
}
//# sourceMappingURL=resolve-text.js.map