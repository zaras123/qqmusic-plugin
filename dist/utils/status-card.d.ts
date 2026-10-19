export declare function buildQQMusicStatusData(userKey?: string): Promise<{
    title: string;
    loggedIn: boolean;
    badge: string;
    nickname: any;
    subtitle: string;
    uin: string;
    uinRaw: string;
    loginTypeText: string;
    apiBase: string;
    keyStatus: string;
    vipTitle: string;
    vipStateText: string;
    musicQuality: any;
    vipExpireText: string;
    stats: {
        label: string;
        value: string;
    }[];
    footer: string;
    avatarUrl: string;
    avatarIsPhoto: boolean;
}>;
