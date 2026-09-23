/**
 * 「主人账号」（配置键 publicAccount）的**唯一**口径
 *
 * 为什么单开一个文件：这条回落链原本在三个地方各写了一遍，而且已经分叉了 ——
 * 锅巴那份漏了 `lastLoginUin`，于是出现「设置卡说未启用、锅巴说已生效」的不一致。
 * 口径只在这里定义，别在别处再写 `cfg.publicAccount || ...`。
 *
 * 回落顺序：手填的 publicAccount → 最近一次扫码登录的账号（lastLoginUserKey，
 * 那是登录会话键）→ 备注 uin（lastLoginUin，老配置里的兜底展示值）。
 *
 * ⚠️ 历史字段 `public_account`（下划线）在 yaml 与锅巴 schema 里**从来没有过**，
 *    属于死别名，2026-09 已删。要加新字段请只加一个名字，别再留别名。
 */

/** 手填的主人账号（trim 过；空串 = 没手填，走自动回落） */
export function publicAccountOf(cfg = {}) {
  return String(cfg?.publicAccount || '').trim()
}

/** 最终生效的主人账号（手填 → 登录会话键 → uin；都没有 = 空串） */
export function resolvePublicAccount(cfg = {}) {
  return publicAccountOf(cfg) || String(cfg?.lastLoginUserKey || cfg?.lastLoginUin || '').trim()
}

/** 是不是「自动」取的（没手填但有回落值）—— 卡片上要标注出来 */
export function isAutoPublicAccount(cfg = {}) {
  return !publicAccountOf(cfg) && Boolean(resolvePublicAccount(cfg))
}
