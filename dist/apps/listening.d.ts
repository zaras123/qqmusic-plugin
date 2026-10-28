declare const qqmusicListening_base: any;
export declare class qqmusicListening extends qqmusicListening_base {
    constructor();
    client(): {
        execute: (command: any, context?: {}) => Promise<any>;
        jobs: (userKey: any) => Promise<any[]>;
        planList: (userKey: any) => Promise<any[]>;
        personalScope: (userKey: any, { isMaster }?: {
            isMaster?: boolean;
        }) => Promise<any>;
    };
    showHelp(e: any): Promise<boolean>;
    listening(e: any): Promise<boolean>;
}
export {};
