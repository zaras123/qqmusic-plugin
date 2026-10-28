/** Metadata from the API's local music library; no new provider or remote requests. */
export function channelMeta(raw = {}, nested = {}) {
    const data = nested && typeof nested === 'object' ? nested : {};
    const local = raw.local === true || data.local === true || (raw.playChannel || data.playChannel) === 'library';
    const source = String(raw.source || data.source || '').toLowerCase();
    const channelKind = String(raw.channelKind || data.channelKind || (local ? 'local' : source && source !== 'qq' ? 'fill' : 'official'));
    return {
        channelKind,
        channelLabel: String(raw.channelLabel || data.channelLabel || (channelKind === 'local' ? '本地音乐库' : channelKind === 'fill' ? '第三方填充渠道' : 'QQ音乐官方')),
        sourceLabel: String(raw.sourceLabel || data.sourceLabel || ''),
    };
}
export function channelTagOf(song = {}, { short = false } = {}) {
    const kind = song.channelKind || (song.local ? 'local' : song.source && song.source !== 'qq' ? 'fill' : 'official');
    const source = song.sourceLabel || song.source || '';
    const quality = song.quality || '音质未知';
    if (kind === 'local')
        return short ? `本地${song.quality ? ` · ${quality}` : ''}` : `本地库${source ? ` · ${source}` : ''}${song.quality ? ` · ${quality}` : ''}`;
    if (kind === 'fill')
        return short ? `${source || '填充'}${song.quality ? ` · ${quality}` : ''}` : `填充 · ${source || '第三方'}${song.quality ? ` · ${quality}` : ''}`;
    return short ? 'QQ官方' : 'QQ音乐官方';
}
export function searchLibraryFields(raw = {}) {
    return {
        local: raw.local === true || raw.playChannel === 'library',
        libraryId: String(raw.libraryId || ''),
        version: String(raw.version || ''),
        versionLabel: String(raw.versionLabel || ''),
        ...channelMeta(raw),
    };
}
export function keepSearchSource(song, allowed) {
    return song.local === true || !song.source || String(song.source).toLowerCase() === 'qq' || allowed.has(String(song.source).toLowerCase());
}
export function audioFormatExtension(format = '') {
    const value = String(format).toLowerCase().replace(/^\./, '');
    return ['mp3', 'm4a', 'aac', 'flac', 'ape', 'ogg', 'wav', 'webm'].includes(value) ? '.' + value : '';
}
export function playLibraryFields(body = {}, nested = {}) {
    const data = nested && typeof nested === 'object' ? nested : {};
    const local = body.local === true || data.local === true || (body.playChannel || data.playChannel) === 'library';
    const source = String(body.source || data.source || '');
    let qualityLabel = String(body.qualityLabel || data.qualityLabel || '');
    if (local && !qualityLabel.includes('本地曲库'))
        qualityLabel = (qualityLabel || String(body.quality || data.quality || '音质未知')) + ' · 本地曲库';
    return {
        local,
        libraryId: String(body.libraryId || data.libraryId || ''),
        matchedSongmid: String(body.matchedSongmid || data.matchedSongmid || ''),
        matchedBy: String(body.matchedBy || data.matchedBy || ''),
        version: String(body.version || data.version || ''),
        versionLabel: String(body.versionLabel || data.versionLabel || ''),
        ext: audioFormatExtension(body.ext || data.ext).replace(/^\./, ''),
        source,
        ...channelMeta(body, data),
        sourceLabel: String(body.sourceLabel || data.sourceLabel || (local ? '本地曲库' : '')),
        qualityLabel,
        external: Boolean(body.external || data.external) || Boolean(local && source && !['qq', 'library'].includes(source)),
    };
}
//# sourceMappingURL=library-compat.js.map