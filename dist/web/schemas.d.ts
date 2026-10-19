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
