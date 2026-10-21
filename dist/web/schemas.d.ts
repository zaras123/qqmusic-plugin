/**
 * Karin 的组件 key 会进入 React Hook Form 路径。
 * 配置字段里的点号（platforms.x.y）必须编码，否则 Form 会把它拆成嵌套对象，
 * Karin 的 getComponentResult 无法还原。
 */
export declare function schemaUiKey(schema: any, index: any): string;
/** 同时兼容扁平点号键与 YAML 里的嵌套对象 */
export declare function configPathValue(data: any, field: any): any;
/**
 * 把 Karin WebUI 实际提交的数据还原成配置字段。
 *
 * Karin 1.18 的 accordion 保存结果是分组的数组，例如：
 *   { "qqmusic-settings": [{ "qqmusic-field-apiBase": "..." }, ...] }
 * 它既不是 YAML 本身，也不是扁平对象。这里递归展开数组/嵌套对象，
 * 并把 UI 安全 key 映射回 `platforms.netease.enabled` 这类真实字段。
 */
export declare function normalizeWebConfigData(data: any): {};
/**
 * 构建 schema（**每次调用现读配置**）
 *
 * ⚠️ 必须是函数而不是模块级常量：Karin WebUI 打开面板时会调 web.config 配置加载，
 * 那时才决定"要不要显示 2.0 的平台分组"。写成常量的话，改完开关得重启机器人
 * 才能看到变化 —— 需求要的是"打开开关，新功能就显现"。
 */
export declare function buildSchemas(): ({
    label: any;
    component: string;
} | {
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    required: boolean;
    componentProps: {
        placeholder: string;
        disabled?: undefined;
        step?: undefined;
        options?: undefined;
        min?: undefined;
        max?: undefined;
    };
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps: {
        placeholder: string;
        disabled?: undefined;
        step?: undefined;
        options?: undefined;
        min?: undefined;
        max?: undefined;
    };
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps?: undefined;
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps: {
        disabled: boolean;
        placeholder: string;
        step?: undefined;
        options?: undefined;
        min?: undefined;
        max?: undefined;
    };
} | {
    required?: undefined;
    field: string;
    label: string;
    component: string;
    componentProps: {
        disabled: boolean;
        placeholder: string;
        step?: undefined;
        options?: undefined;
        min?: undefined;
        max?: undefined;
    };
    bottomHelpMessage?: undefined;
} | {
    required?: undefined;
    field: string;
    label: string;
    component: string;
    bottomHelpMessage?: undefined;
    componentProps?: undefined;
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        options: readonly {
            label: string;
            value: string;
        }[];
        placeholder: string;
        step?: undefined;
        min?: undefined;
        max?: undefined;
    };
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        min: number;
        max: number;
        placeholder: string;
        step?: undefined;
        options?: undefined;
    };
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        options: {
            label: string;
            value: any;
        }[];
        placeholder: string;
        step?: undefined;
        min?: undefined;
        max?: undefined;
    };
} | {
    required?: undefined;
    field: string;
    label: string;
    bottomHelpMessage: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        min: number;
        max: number;
        placeholder?: undefined;
        step?: undefined;
        options?: undefined;
    };
} | {
    required?: undefined;
    bottomHelpMessage?: undefined;
    field: string;
    label: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        min: number;
        max: number;
        placeholder?: undefined;
        step?: undefined;
        options?: undefined;
    };
} | {
    required?: undefined;
    bottomHelpMessage?: undefined;
    field: string;
    label: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        placeholder: string;
        step?: undefined;
        options?: undefined;
        min?: undefined;
        max?: undefined;
    };
} | {
    required?: undefined;
    bottomHelpMessage?: undefined;
    field: string;
    label: string;
    component: string;
    componentProps: {
        disabled?: undefined;
        placeholder?: undefined;
        min: number;
        max: number;
        step: number;
        options?: undefined;
    };
})[];
export declare function getConfigData(): any;
export declare function setConfigData(data: any, { Result }?: {}): Promise<any>;
