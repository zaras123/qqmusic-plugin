/**
 * 锅巴配置 Schema
 *
 * 2026-09-23 重构：以前所有字段平铺在一页（30+ 项，找一项要往下滚半天）。
 * 现在用 `SOFT_GROUP_BEGIN`（与 R 插件的做法一致）分成**三大组**：
 *   ① 基础设置 / ② 界面与外观 / ③ 发送与下载
 * ⚠️ 分得太细反而更难找 —— 第一版拆了 7 组（接口、开关、音质、点歌、一起听…），
 *    用户反馈"太细了"，于是合并成上面三个。（分组粒度：能一眼扫完一屏为准。）
 * **字段本身一个没少、名字一个没改** —— 老用户打开后语义完全相同。
 *
 * 另有一个**隐藏分组**：`？？？`。它是 2.0 总开关，关着时：
 *   · 这里看不到任何平台相关分组（与老版本界面一致）
 *   · 机器人那边多平台命令不响应、帮助卡还是老那张（见 utils/v2.js）
 * 打开后平台分组才会出现，且**立刻生效**（schema 与判定都是现读配置，不用重启）。
 */
import Config from '../components/Config.js'
import { pullLoginMeta, normalizeApiBase } from '../utils/api.js'
import { QQMUSIC_QUALITY_LIST } from '../utils/quality.js'
import { listThemeIds, loadManifest, darkPrefOf } from '../utils/theme.js'
import { PLATFORMS, VISIBLE_PLATFORMS, platformHasQualityChoice, platformQualities } from '../utils/platforms.js'
import { V2_FIELD, isV2Unlocked, platformEnabled, platformQualityPref, platformFillEnabled } from '../utils/v2.js'

/** 分组小工具（R 插件同款：SOFT_GROUP_BEGIN 之后到下一个 BEGIN 之间归本组） */
const group = (label) => ({ label, component: 'SOFT_GROUP_BEGIN' })

/** 卡片主题下拉项：直接扫 resources/themes/，丢个主题目录进去（重启锅巴后）就会出现在这里 */
const UI_THEME_OPTIONS = (() => {
  const ids = listThemeIds()
  return (ids.length ? ids : ['classic']).map((id) => {
    const m = loadManifest(id)
    return { label: `${m?.name || id}${m?.dark ? '（支持深色）' : ''}`, value: id }
  })
})()

/**
 * 构建 schema（**每次调用现读配置**）
 *
 * ⚠️ 必须是函数而不是模块级常量：锅巴打开面板时会调 supportGuoba()，
 * 那时才决定"要不要显示 2.0 的平台分组"。写成常量的话，改完开关得重启机器人
 * 才能看到变化 —— 需求要的是"打开开关，新功能就显现"。
 */
export function buildSchemas() {
  const cfg = Config.getConfig('qqmusic') || {}
  const unlocked = isV2Unlocked(cfg)

  return [
  group('① 基础设置'),
  // ── 接口与登录 ──
  {
    field: 'apiBase',
    label: 'API 地址',
    bottomHelpMessage: 'qqmusic-api-enhanced 服务地址',
    component: 'Input',
    required: true,
    componentProps: {
      placeholder: 'http://127.0.0.1:3300',
    },
  },
  {
    field: 'apiToken',
    label: 'API Token',
    bottomHelpMessage: '与 API 端配置的 Token 一致',
    component: 'InputPassword',
    componentProps: {
      placeholder: 'API Token',
    },
  },
  {
    field: 'pullLoginMeta',
    label: '从 API 查询登录态',
    bottomHelpMessage: '打开并保存：查询 API 当前登录的 uin/昵称回填到下方备注',
    component: 'Switch',
  },
  {
    field: 'lastLoginUin',
    label: '最近登录 uin（备注）',
    bottomHelpMessage: '扫码成功后自动填写',
    component: 'Input',
    componentProps: {
      disabled: true,
      placeholder: '未登录',
    },
  },
  {
    field: 'lastLoginNick',
    label: '最近登录昵称（备注）',
    component: 'Input',
    componentProps: {
      disabled: true,
      placeholder: '未登录',
    },
  },
  {
    field: 'forceMasterAccount',
    label: '一律走主人账号',
    bottomHelpMessage:
      '开启后所有人点歌都按主人账号（主人的 ck）取播放链，不看请求者自己有没有登录过（群友在自己机器人上登录过也不影响）。主人账号自动取最近扫码登录的账号，无需手填；登录状态/收藏/刷新仍按请求者本人',
    component: 'Switch',
  },
  // ── 功能开关（同属"基础设置"）──
  {
    field: 'enable',
    label: '启用插件',
    component: 'Switch',
  },
  {
    field: 'enableSongRequest',
    label: '开启点歌',
    bottomHelpMessage: '#qqm点歌 / #qqm听 / #qqm播放',
    component: 'Switch',
  },
  {
    field: 'enableResolve',
    label: '开启卡片/链接解析',
    bottomHelpMessage: '识别 QQ 音乐分享与 y.qq.com 链接',
    component: 'Switch',
  },
  {
    field: 'renderListCard',
    label: '点歌结果图片卡片',
    bottomHelpMessage: '开启：返回图片列表卡；关闭：回退纯文本列表',
    component: 'Switch',
  },
  {
    field: 'qrLoginEnable',
    label: '允许扫码登录命令',
    bottomHelpMessage: '#qqm登录',
    component: 'Switch',
  },
  // ── 音质 / 点歌 / 一起听：都属于"基础设置"，不再各分一组（分组太细反而难找）──
  {
    field: 'quality',
    label: '最高音质',
    bottomHelpMessage: '推荐选「自动」：按歌曲实际文件选最高可用音质',
    component: 'Select',
    componentProps: {
      options: QQMUSIC_QUALITY_LIST,
      placeholder: '请选择最高音质或自动',
    },
  },
  {
    field: 'qualityFallback',
    label: '音质自动降级',
    bottomHelpMessage: '开启：从最高档向下尝试，直到可播',
    component: 'Switch',
  },
  {
    field: 'defaultPickSong',
    label: '接管无前缀「#点歌」',
    bottomHelpMessage:
      '开启后：「#点歌 关键词」由本插件处理（不加 #qqm 前缀）。默认关闭，以免与其它点歌插件抢命令',
    component: 'Switch',
  },
  {
    field: 'extraSources',
    label: '其它平台补充曲',
    bottomHelpMessage:
      '开启后：点歌列表尾部追加其它平台的免费曲（免登录、实测能播的才返回）。' +
      '补哪几家由「？？？」里的平台页签决定（每家的「参与跨平台补歌」）。默认开启',
    component: 'Switch',
  },
  // 「QQ 音源开关」是 2.0 的设定（"QQ 不是主营"）——没解锁时它既不显示也不生效，
  // 否则老用户会看到一个拨了没反应的开关，等于告诉他"这里藏了东西"
  ...(unlocked
    ? [
        {
          field: 'qqEnabled',
          label: '启用 QQ 音乐音源',
          bottomHelpMessage:
            '默认开启。关掉后本机器人**只用其它平台**：#qqm点歌 会直接搜「？？？」里开着的那几家（免费曲），' +
            '不再打 QQ 曲库；QQ 账号相关功能（收藏/日推/无损）自然也就用不上',
          component: 'Switch',
        },
      ]
    : []),
  {
    field: 'togetherEnable',
    label: '启用一起听（未维护，勿开）',
    bottomHelpMessage:
      '⚠️ 未维护，请勿开启（2026-09-21）：加歌会被服务端拒（10003 tmem error），而同一账号在真 QQ 客户端里能加。包体/顺序/参数/账号/签名都排查过，差异只在 icqq 拼的 SSO 信封上。等接入 NTQQ 系协议端（NapCat / SnowLuma）验证后再说',
    component: 'Switch',
  },
  {
    field: 'togetherAuto',
    label: '点歌后自动同步（未维护，勿开）',
    bottomHelpMessage: '⚠️ 依赖加歌链路，同上未维护（手动 #qqm一起听 N 不受此开关影响）',
    component: 'Switch',
  },
  group('② 界面与外观'),
  {
    field: 'uiTheme',
    label: '卡片主题',
    bottomHelpMessage:
      'resources/themes/ 下的目录名；丢一个目录进去就能加自己的主题（缺哪张卡会自动回落到 classic）。换主题与改模板都是热更新，不用重启',
    component: 'Select',
    componentProps: {
      options: UI_THEME_OPTIONS,
      placeholder: '请选择卡片主题',
    },
  },
  // 2.0 主题：只在解锁后出现（没解锁时用不上，省得一页里放两个"主题"让人懵）
  ...(unlocked
    ? [
        {
          field: 'uiThemeV2',
          label: '卡片主题（2.0）',
          bottomHelpMessage:
            '？？？打开后用这一套（默认「多平台」：每首歌/每个平台都带来源色标）。想在新版里继续用老皮肤就选 classic / apple',
          component: 'Select',
          componentProps: {
            options: UI_THEME_OPTIONS,
            placeholder: '默认：星云',
          },
        },
      ]
    : []),
  {
    field: 'uiDark',
    label: '深浅色',
    bottomHelpMessage:
      '「跟随时间」= 夜晚（20:00-5:00）自动切深色。只对声明支持深色的主题生效（apple 支持；classic 是浅色专用）',
    component: 'Select',
    componentProps: {
      options: [
        { label: '浅色', value: 'light' },
        { label: '深色', value: 'dark' },
        { label: '跟随时间（夜晚自动深色）', value: 'auto' },
      ],
      placeholder: '请选择深浅色',
    },
  },
  {
    field: 'uiTimeColor',
    label: '底色跟随时段',
    bottomHelpMessage:
      '清晨 5-8 / 白天 8-17 / 黄昏 17-20 / 夜晚 20-5 各一套底色（需要主题声明了时段配色，apple 有）',
    component: 'Switch',
  },
  {
    field: 'uiBgEnable',
    label: '自定义卡片背景',
    bottomHelpMessage:
      '开启后卡片切成 iOS 液态玻璃（半透明+高光）。**只有 apple 主题支持**，其余主题会忽略。背景图取不到时会自动回落主题自带底色，不影响发卡',
    component: 'Switch',
  },
  {
    field: 'uiBgValue',
    label: '背景来源',
    bottomHelpMessage:
      '本地路径（Windows D:\\图片\\a.jpg / Linux /root/pics/a.jpg）、图片直链、或图片 API（返回 JSON 里有图片地址，或直接返回图片）—— 自动识别，不用选类型',
    component: 'Input',
    componentProps: {
      placeholder: 'D:\\图片\\a.jpg  或  https://example.com/a.jpg',
    },
  },
  {
    field: 'uiBgCacheMin',
    label: '远端背景缓存(分钟)',
    bottomHelpMessage: '0 = 每次渲染都重新取（随机图 API 想换得勤就填 0）；本地路径不受此项影响',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 1440,
    },
  },
  group('③ 发送与下载'),
  {
    field: 'sendVocal',
    label: '发送群语音',
    bottomHelpMessage: '下载完整音频后以语音发送',
    component: 'Switch',
  },
  {
    field: 'disableHighQualityVocal',
    label: '禁用高清语音',
    bottomHelpMessage: 'PC QQ 无法播放高清语音时开启：语音改发 mono16k 低音质，PC 可正常播放',
    component: 'Switch',
  },
  {
    field: 'uploadFile',
    label: '上传群文件',
    component: 'Switch',
  },
  {
    field: 'sendNativeCard',
    label: '发送原生 QQ 音乐卡',
    component: 'Switch',
  },
  {
    field: 'sendCustomCard',
    label: '发送自定义音乐卡',
    component: 'Switch',
  },
  {
    field: 'sendTextInfo',
    label: '发送文本识别信息',
    component: 'Switch',
  },
  {
    field: 'maxList',
    label: '点歌列表数量',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 20,
    },
  },
  {
    field: 'identifyPrefix',
    label: '识别前缀',
    component: 'Input',
    componentProps: {
      placeholder: '识别：',
    },
  },
  {
    field: 'tempDir',
    label: '临时下载目录',
    bottomHelpMessage: '相对 Yunzai 根目录',
    component: 'Input',
  },
  {
    field: 'downloadTimeout',
    label: '下载超时(ms)',
    component: 'InputNumber',
    componentProps: {
      min: 10000,
      max: 300000,
      step: 5000,
    },
  },
  {
    field: 'keepFileSec',
    label: '本地文件保留秒数',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 3600,
    },
  },

  /* ── ？？？：2.0 总开关（隐藏分组）─────────────────────────────────
   * 名字就叫「？？？」，不写任何说明 —— 需求原文如此。
   * 打开后：下面会多出「音源平台」分组，机器人侧多平台点歌/新帮助 UI 一起生效；
   * 关着时：这里看一眼和 1.x 没有任何区别。
   * ⚠️ 判定逻辑**只有** utils/v2.js 一处（isV2Unlocked），这里只负责显示。
   */
  group('？？？'),
  {
    field: V2_FIELD,
    label: '？？？',
    bottomHelpMessage: '？？？',
    component: 'Switch',
  },

  /* ── 2.0 平台分组：**仅在 ？？？ 打开后出现** ───────────────────── */
  ...(unlocked
    ? [
        // ── **按平台分页签**（与 R 插件同款：B站 / 抖音 / 油管 / 网易云 各占一个页签）──
        //
        // ⚠️ 走过的两条弯路，别再回去：
        //   1) 全部平台塞在一页（每家一个开关 + 一个条数 = 16 行）→ 用户："太细了"
        //   2) 收成一个多选下拉 → 用户要的是**按平台分页签**（见 R 插件的锅巴截图）
        // 现在：一家一个页签，页签里就是"这家自己的开关 + 条数 + 用法"，互不干扰。
        {
          component: 'Divider',
          label: '2.0 命令：#qqm<平台> 关键词 点歌 · #qqm<平台>播放 直搜直播 · #qqm<平台>登录 扫码（主人；网易云/酷狗/汽水）· #qqm源 切换默认音源（主人=全群、成员=只对自己）· #qqm平台 看清单 · #qqm平台状态 看各家登录状态卡',
        },
        ...VISIBLE_PLATFORMS.filter((p) => !p.own).flatMap((p) => [
          group(p.label),
          {
            component: 'Divider',
            label: `${p.label} · 免登录 ${p.quality}${p.needsCredential ? ' · ⚠️ 需要 API 侧先配好凭据' : ''}`,
          },
          {
            field: `platforms.${p.id}.enabled`,
            label: `启用 ${p.label}`,
            bottomHelpMessage: `关掉后：#qqm${p.label}点歌 不响应、帮助卡与锅巴里也不再出现这一家`,
            component: 'Switch',
          },
          // ── 这家平台**自己的功能**（不是每家都一样的通用开关）──
          {
            field: `platforms.${p.id}.fill`,
            label: '参与「跨平台补歌」',
            bottomHelpMessage:
              '开启：#qqm点歌 的结果尾部会补上这家的免费曲；关闭：只在 #qqm' +
              `${p.label}点歌 里出现（不想让某个普通关键词结果被这家占位就关掉）`,
            component: 'Switch',
          },
          // 音质档位：只有真有多档可选的平台才显示（数据源与 API 的 QUALITY_OPTIONS 对齐）
          ...(platformHasQualityChoice(p.id)
            ? [
                {
                  field: `platforms.${p.id}.quality`,
                  label: '音质档位',
                  bottomHelpMessage:
                    '点名这一家的取链档位。标"要账号/会员"的档位在没配时**会自动回落**（响应里会写明实际档位），不会点了没声',
                  component: 'Select',
                  componentProps: {
                    options: platformQualities(p.id),
                    placeholder: '默认自动',
                  },
                },
              ]
            : []),
          {
            field: `platforms.${p.id}.maxList`,
            label: '列表条数',
            bottomHelpMessage: `#qqm${p.label}点歌 一次列几首；留空 = 跟随「① 基础设置」里的点歌列表数量`,
            component: 'InputNumber',
            componentProps: { min: 1, max: 20, placeholder: '留空 = 跟随全局' },
          },
          {
            component: 'Divider',
            label: `用法：#qqm${p.short || p.label} 关键词（最短）；也可以 #qqm${p.label}点歌 / #qqm${p.label}播放 —— 都只在 ${p.label} 里搜`,
          },
        ]),
      ]
    : []),
  ]
}

export function getConfigData() {
  const c = Config.getConfig('qqmusic')
  return {
    ...c,
    // 带默认值的开关：配置里没有该键时也给界面一个明确布尔值，
    // 否则锅巴显示"关"、实际却是"开"，对不上
    extraSources: c.extraSources !== false,
    defaultPickSong: c.defaultPickSong === true,
    forceMasterAccount: c.forceMasterAccount === true,
    togetherEnable: c.togetherEnable === true,
    togetherAuto: c.togetherAuto === true,
    uiTheme: String(c.uiTheme || 'classic'),
    // 2.0 主题：？？？打开后用它（默认「星云·鎏光」；老主题仍可显式选）
    // ⚠️ 这里的默认值必须与 utils/theme.js 的 DEFAULT_THEME_V2 一致 ——
    //    两边写不一样的话，锅巴显示的主题和实际渲染的主题会不是一个（踩过）
    uiThemeV2: String(c.uiThemeV2 || 'nebula'),
    uiDark: darkPrefOf(c.uiDark),
    uiTimeColor: c.uiTimeColor !== false,
    uiBgEnable: c.uiBgEnable === true,
    uiBgValue: String(c.uiBgValue || ''),
    uiBgCacheMin: c.uiBgCacheMin === undefined || c.uiBgCacheMin === '' ? 10 : Number(c.uiBgCacheMin) || 0,
    songRequestMaxList: c.maxList ?? c.songRequestMaxList ?? 10,
    pullLoginMeta: false,
    // QQ 音源开关：缺省=开（老配置没有这个键 → 与 1.x 完全一致）
    qqEnabled: c.qqEnabled !== false,
    // 2.0 开关：**必须给出明确布尔值**（否则锅巴显示"关"、实际 undefined 也算关，
    // 但用户点一下"保存"会把整个 platforms 段写成字符串，见 setConfigData 的 setPath）
    [V2_FIELD]: isV2Unlocked(c),
    // 平台段：给界面补全每一家的默认值（缺省=开；条数留空=跟随全局 maxList）
    // —— 每个平台一个页签，页签里读的就是这里的值
    platforms: Object.fromEntries(
      PLATFORMS.filter((p) => !p.own).map((p) => [
        p.id,
        {
          enabled: platformEnabled(c, p.id),
          fill: platformFillEnabled(c, p.id),
          quality: platformQualityPref(c, p.id),
          maxList: c?.platforms?.[p.id]?.maxList ?? '',
        },
      ])
    ),
  }
}

export async function setConfigData(data, { Result } = {}) {
  try {
    const cur = Config.getConfig('qqmusic')
    const next = { ...cur }

    /**
     * 按点号路径写入（`platforms.netease.enabled` 这种嵌套字段）
     *
     * ⚠️ 以前是把 key 当成**平铺字段**直接 `next[k] = v`，加了嵌套字段之后
     * 会写出一个字面量键 `"platforms.netease.enabled"` —— 开关保存后看着"弹回去"，
     * 而配置文件里多了一条谁都不认识的键。
     */
    const setPath = (target, pathStr, value) => {
      const parts = String(pathStr).split('.')
      let node = target
      for (let i = 0; i < parts.length - 1; i += 1) {
        const seg = parts[i]
        if (typeof node[seg] !== 'object' || node[seg] === null || Array.isArray(node[seg])) {
          node[seg] = {}
        }
        node = node[seg]
      }
      const leaf = parts[parts.length - 1]
      // undefined = 删除该键（平台条数留空时用它清掉，别留一个空串在配置里）
      if (value === undefined) delete node[leaf]
      else node[leaf] = value
    }
    const pickValue = (k) => {
      if (data[k] !== undefined) return data[k]
      if (data[`qqmusic.${k}`] !== undefined) return data[`qqmusic.${k}`]
      return undefined
    }

    // 白名单直接由 schema 推导 —— 以前是手写数组，加了新开关忘了同步这里，
    // 锅巴保存时会被静默丢弃（表现：开关一打开就弹回原状）
    const UI_ONLY_FIELDS = new Set(['pullLoginMeta']) // 仅界面用，不落盘
    const EXTRA_KEYS = [
      // 未暴露在界面上但需要保留可写的历史字段
      'songRequestMaxList',
      'resolveLinks',
      'resolveCards',
      'lastLoginUin',
      'lastLoginNick',
    ]
    // schema 现在由函数生成（2.0 未解锁时不含平台分组）：**两种形态都要收集键**，
    // 否则"关掉 ？？？ 之后保存"会把平台段整个丢掉
    const keys = [
      ...new Set([
        ...buildSchemas().map((s) => s.field).filter((f) => f && !UI_ONLY_FIELDS.has(f)),
        ...PLATFORMS.filter((p) => !p.own).flatMap((p) => [
          `platforms.${p.id}.enabled`,
          `platforms.${p.id}.maxList`,
          `platforms.${p.id}.fill`,
          `platforms.${p.id}.quality`,
        ]),
        ...EXTRA_KEYS,
      ]),
    ]

    for (const k of keys) {
      const v = pickValue(k)
      if (v === undefined) continue
      // 平台条数留空 = 跟随全局（写成空串会让 API 侧算不出条数）
      if (/^platforms\..+\.maxList$/.test(k) && (v === '' || v === null)) {
        setPath(next, k, undefined)
        continue
      }
      // 档位选「自动」= 不落盘（保持配置干净；读取侧 platformQualityPref 也会兜成 auto）
      if (/^platforms\..+\.quality$/.test(k) && ['', 'auto'].includes(String(v).toLowerCase())) {
        setPath(next, k, undefined)
        continue
      }
      setPath(next, k, v)
    }

    const allowed = new Set(QQMUSIC_QUALITY_LIST.map((i) => i.value))
    if (next.quality && !allowed.has(String(next.quality))) {
      const map = {
        lossless: 'flac',
        exhigh: '320',
        standard: '128',
        higher: 'm4a',
        jymaster: 'master',
        dolby: 'atmos',
      }
      next.quality = map[next.quality] || 'flac'
    }

    if (next.songRequestMaxList != null && next.maxList == null) {
      next.maxList = next.songRequestMaxList
    }
    if (next.maxList != null) next.maxList = Number(next.maxList) || 10
    if (next.apiBase) next.apiBase = normalizeApiBase(next.apiBase)

    const wantPull =
      data.pullLoginMeta === true ||
      data['qqmusic.pullLoginMeta'] === true ||
      data.pullLoginMeta === 1 ||
      data.pullLoginMeta === '1'

    let pullMsg = ''
    if (wantPull) {
      try {
        const meta = await pullLoginMeta()
        if (meta.login && meta.hasKey) {
          next.lastLoginUin = meta.uin || next.lastLoginUin || ''
          // 登录会话在 API 侧按 userKey 存；主人账号自动模式靠它定位，备注 uin 可能与会话键不同
          if (meta.userKey && meta.userKey !== 'default') next.lastLoginUserKey = meta.userKey
          next.lastLoginNick = meta.nick || next.lastLoginNick || ''
          next.lastLoginAt = Date.now()
          next.lastHasRefresh = meta.hasRefresh
          pullMsg = `已查到登录态（uin=${meta.uin || '-'}）`
        } else {
          pullMsg = 'API 当前未登录'
        }
      } catch (e) {
        pullMsg = `查询失败：${e.message}`
      }
    }

    Config.setConfig('qqmusic', next)

    const okMsg = [pullMsg, '保存成功'].filter(Boolean).join('；')
    if (Result?.ok) return Result.ok({}, okMsg)
    return { success: true, message: okMsg }
  } catch (e) {
    if (Result?.error) return Result.error(e.message || String(e))
    return { success: false, message: e.message }
  }
}
