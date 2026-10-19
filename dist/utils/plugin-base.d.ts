/** 异步加载插件基类；并发调用共享同一个 Promise。 */
export declare function loadPluginBase(): any;
/** 同步读取已加载的基类。 */
export declare function pluginBaseSync(): any;
/** 当前基类是否是离线 stub。 */
export declare function isStubBase(): boolean;
