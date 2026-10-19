import { components, defineConfig } from 'node-karin';
import { buildSchemas, getConfigData, setConfigData } from './web/schemas.js';
const PLUGIN_ID = 'karin-plugin-qqmusic';
function configValue(data, field) {
    if (!field)
        return undefined;
    if (data[field] !== undefined)
        return data[field];
    return data[`qqmusic.${field}`];
}
function componentKey(schema, index) {
    return schema.field || `qqmusic-ui-${index}`;
}
function commonOptions(schema, data) {
    const props = schema.componentProps || {};
    return {
        label: schema.label || '',
        description: schema.bottomHelpMessage || '',
        placeholder: props.placeholder,
        defaultValue: configValue(data, schema.field),
        isDisabled: props.disabled === true,
    };
}
function toKarinComponent(schema, index, data) {
    const key = componentKey(schema, index);
    const props = schema.componentProps || {};
    const base = commonOptions(schema, data);
    switch (schema.component) {
        case 'Input':
            return components.input.string(key, base);
        case 'InputPassword':
            return components.input.password(key, base);
        case 'InputTextArea':
            return components.input.string(key, base);
        case 'InputNumber':
            return components.input.number(key, {
                ...base,
                rules: [
                    {
                        min: props.min,
                        max: props.max,
                        error: `${schema.label || key} 应在 ${props.min ?? '-'} - ${props.max ?? '-'} 之间`,
                    },
                ],
            });
        case 'Switch':
            return components.switch.create(key, {
                label: schema.label || '',
                description: schema.bottomHelpMessage || '',
                defaultSelected: Boolean(configValue(data, schema.field)),
                isDisabled: props.disabled === true,
            });
        case 'Select':
            return components.select.create(key, {
                ...base,
                items: (props.options || []).map((item) => ({
                    label: item.label,
                    value: item.value,
                })),
            });
        case 'Divider':
            return components.divider.create(key, {
                label: schema.label || '',
            });
        default:
            return null;
    }
}
function buildComponents() {
    const data = getConfigData();
    const roots = [];
    let currentGroup = null;
    buildSchemas().forEach((schema, index) => {
        if (schema.component === 'SOFT_GROUP_BEGIN') {
            currentGroup = components.accordion.create(`group-${index}`, {
                title: schema.label || `分组 ${index + 1}`,
                variant: 'bordered',
                selectionMode: 'multiple',
                selectionBehavior: 'toggle',
                showDivider: true,
                fullWidth: true,
                children: [],
            });
            roots.push(currentGroup);
            return;
        }
        const component = toKarinComponent(schema, index, data);
        if (!component)
            return;
        if (currentGroup)
            currentGroup.children.push(component);
        else
            roots.push(component);
    });
    return roots;
}
export default defineConfig({
    info: {
        id: PLUGIN_ID,
        name: 'QQ音乐插件',
        author: { name: 'local', home: '' },
        icon: { color: '#31c27c' },
        description: 'QQ 音乐点歌 / 卡片解析 / 扫码登录',
    },
    components: () => buildComponents(),
    save: async (config) => {
        try {
            const result = await setConfigData(config);
            return {
                success: result?.success !== false,
                message: result?.message || (result?.success === false ? '保存失败' : '保存成功'),
            };
        }
        catch (err) {
            return { success: false, message: err?.message || String(err) };
        }
    },
});
//# sourceMappingURL=web.config.js.map