export default class Config {
    /** 启动时调用：扫描 default_config，缺失的用户配置全部补齐 */
    static init(): void;
    static getConfig(name?: string): any;
    static setConfig(name: any, data: any): void;
    static mergeConfig(name: any, patch: any): any;
}
