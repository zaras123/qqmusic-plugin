import { buildSchemas, getConfigData, setConfigData } from './schemas.js'

export default {
  /**
   * ⚠️ 用 getter（**每次读时现算**），不是模块级常量：
   * 锅巴打开面板时才决定"要不要显示 2.0 的平台分组"。
   * 写成常量的话，改完那个开关必须重启机器人才能看到分组变化 ——
   * 需求要的正好相反（打开开关 → 新功能立刻显现）。
   */
  get schemas() {
    return buildSchemas()
  },
  getConfigData,
  setConfigData,
}
