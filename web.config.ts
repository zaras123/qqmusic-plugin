import { components, defineConfig } from 'node-karin'
import { buildSchemas, getConfigData, setConfigData } from './web/schemas.js'
import { buildKarinComponents } from './web/components.js'

const PLUGIN_ID = 'karin-plugin-qqmusic'

function buildComponents() {
  const data = getConfigData()
  return buildKarinComponents(components, buildSchemas(), data)
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
      const result = await setConfigData(config)
      return {
        success: result?.success !== false,
        message: result?.message || (result?.success === false ? '保存失败' : '保存成功'),
      }
    } catch (err) {
      return { success: false, message: err?.message || String(err) }
    }
  },
})
