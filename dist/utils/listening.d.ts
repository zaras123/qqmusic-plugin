import { request } from './api.js';
export declare const RE_LISTENING: RegExp;
export declare const LISTENING_TIP = "\u4F7F\u7528\u672C\u4EBA\u767B\u5F55\u69FD\u6216\u72EC\u7ACB Token \u7684\u7ED1\u5B9A\u8D26\u53F7\uFF1B\u5171\u4EAB Token \u4E0D\u652F\u6301\u65F6\u957F\u4EFB\u52A1\u3002\u5DF2\u63A5\u6536\u91CF\u4E0E\u5E73\u53F0\u7EDF\u8BA1\u589E\u91CF\u5206\u5F00\u663E\u793A\uFF1B\u540E\u53F0\u4E0D\u64AD\u653E\u97F3\u9891\uFF0C\u771F\u5B9E\u8D26\u53F7\u5165\u8D26\u4ECD\u672A\u5B8C\u6210\u9A8C\u6536\u3002";
export declare const LISTENING_HELP_SECTION: {
    title: string;
    tag: string;
    master: boolean;
    items: {
        name: string;
        desc: string;
        example: string;
    }[];
};
export declare const LISTENING_USAGE: string;
export declare function parseListeningCommand(text?: string): {
    action: string;
    message: any;
} | {
    action: string;
    operation: string;
    selector: string;
    confirmed: boolean;
    id?: undefined;
    targetType?: undefined;
    roundSeconds?: undefined;
    repeat?: undefined;
    totalRounds?: undefined;
    scheduleTime?: undefined;
    platform?: undefined;
    minutes?: undefined;
    target?: undefined;
} | {
    selector?: undefined;
    action: string;
    operation: string;
    id: string;
    confirmed: boolean;
    targetType?: undefined;
    roundSeconds?: undefined;
    repeat?: undefined;
    totalRounds?: undefined;
    scheduleTime?: undefined;
    platform?: undefined;
    minutes?: undefined;
    target?: undefined;
} | {
    selector?: undefined;
    operation?: undefined;
    id?: undefined;
    action: string;
    platform: any;
    targetType: string;
    target: string;
    roundSeconds: number;
    repeat: string;
    totalRounds: number;
    scheduleTime: string;
    confirmed: boolean;
    minutes?: undefined;
} | {
    selector?: undefined;
    operation?: undefined;
    id?: undefined;
    targetType?: undefined;
    roundSeconds?: undefined;
    repeat?: undefined;
    totalRounds?: undefined;
    scheduleTime?: undefined;
    action: string;
    platform: any;
    confirmed?: boolean;
    minutes?: undefined;
    target?: undefined;
} | {
    selector?: undefined;
    operation?: undefined;
    targetType?: undefined;
    roundSeconds?: undefined;
    repeat?: undefined;
    totalRounds?: undefined;
    scheduleTime?: undefined;
    action: string;
    id: string;
    confirmed?: boolean;
    platform?: undefined;
    minutes?: undefined;
    target?: undefined;
} | {
    selector?: undefined;
    operation?: undefined;
    id?: undefined;
    targetType?: undefined;
    roundSeconds?: undefined;
    repeat?: undefined;
    totalRounds?: undefined;
    scheduleTime?: undefined;
    action: string;
    confirmed?: boolean;
    platform?: undefined;
    minutes?: undefined;
    target?: undefined;
} | {
    selector?: undefined;
    operation?: undefined;
    id?: undefined;
    targetType?: undefined;
    roundSeconds?: undefined;
    repeat?: undefined;
    totalRounds?: undefined;
    scheduleTime?: undefined;
    action: string;
    platform: any;
    minutes: number;
    target: string;
    confirmed: boolean;
};
export declare function formatListeningJob(job: any): string;
export declare function listeningError(error: any): any;
export declare function formatListeningPlan(plan: any): string;
export declare function buildListeningStatusCard(job: any, plans?: any[]): {
    title: string;
    subtitle: string;
    status: any;
    song: any;
    artist: any;
    platform: any;
    requested: string;
    submitted: string;
    confirmed: string;
    planText: string;
    tip: string;
};
export declare function createListeningClient({ call }?: {
    call?: typeof request;
}): {
    execute: (command: any, context?: {}) => Promise<any>;
    jobs: (userKey: any) => Promise<any[]>;
    planList: (userKey: any) => Promise<any[]>;
    personalScope: (userKey: any, { isMaster }?: {
        isMaster?: boolean;
    }) => Promise<any>;
};
