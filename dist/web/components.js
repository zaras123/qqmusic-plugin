import { configPathValue, schemaUiKey } from './schemas.js';
function componentOptions(schema, data) {
    const props = schema.componentProps || {};
    return {
        label: schema.label || '',
        description: schema.bottomHelpMessage || '',
        placeholder: props.placeholder,
        defaultValue: configPathValue(data, schema.field),
        isRequired: schema.required === true,
        isDisabled: props.disabled === true,
    };
}
export function toKarinComponent(components, schema, index, data) {
    const key = schemaUiKey(schema, index);
    const props = schema.componentProps || {};
    const base = componentOptions(schema, data);
    switch (schema.component) {
        case 'Input':
            return components.input.string(key, base);
        case 'InputPassword':
            return components.input.password(key, base);
        case 'InputTextArea':
            // node-karin 1.18 没有独立 textarea 组件；提高输入框高度承载多行凭据。
            return components.input.string(key, {
                ...base,
                // Karin 会自己拼 px 后缀，height 必须是纯数字字符串。
                height: String(props.height || 160).replace(/px$/i, ''),
            });
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
                defaultSelected: configPathValue(data, schema.field) === true,
                isDisabled: props.disabled === true,
            });
        case 'Select':
            return components.select.create(key, {
                ...base,
                items: (props.options || []).map((item, itemIndex) => components.select.createItem(`${key}-option-${itemIndex}`, {
                    label: item.label,
                    value: item.value,
                })),
            });
        case 'Divider':
            return components.divider.create(key, {
                // Karin DividerProps 的可见文本字段是 description，不是 label。
                description: schema.label || '',
            });
        default:
            return null;
    }
}
export function groupSchemas(schemas) {
    const groups = [];
    let current = null;
    schemas.forEach((schema, index) => {
        if (schema.component === 'SOFT_GROUP_BEGIN') {
            current = {
                key: `qqmusic-group-${index}`,
                title: schema.label || `分组 ${groups.length + 1}`,
                schemas: [],
            };
            groups.push(current);
            return;
        }
        if (!current)
            return;
        current.schemas.push(schema);
    });
    return groups;
}
export function buildKarinComponents(components, schemas, data) {
    const groups = groupSchemas(schemas);
    const items = groups.map((group, groupIndex) => {
        const children = group.schemas
            .map((schema, schemaIndex) => toKarinComponent(components, schema, schemaIndex, data))
            .filter(Boolean);
        return components.accordion.createItem(group.key, {
            title: group.title,
            subtitle: '',
            children,
        });
    });
    return [
        components.accordion.create('qqmusic-settings', {
            label: 'QQ音乐配置',
            variant: 'bordered',
            selectionMode: 'multiple',
            selectionBehavior: 'toggle',
            showDivider: true,
            fullWidth: true,
            defaultSelectedKeys: items.map((item) => item.key),
            children: items,
        }),
    ];
}
//# sourceMappingURL=components.js.map