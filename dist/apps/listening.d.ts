declare const qqmusicListening_base: any;
export declare class qqmusicListening extends qqmusicListening_base {
    constructor();
    client(): {
        execute: (command: any, { userKey, messageId, selfId }?: {
            messageId?: string;
            selfId?: string;
        }) => Promise<any>;
        jobs: (userKey: any) => Promise<any[]>;
        planList: (userKey: any) => Promise<any[]>;
        personalScope: (userKey: any) => Promise<void>;
    };
    showHelp(e: any): Promise<boolean>;
    listening(e: any): Promise<boolean>;
}
export {};
