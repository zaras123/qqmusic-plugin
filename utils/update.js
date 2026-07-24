/**
 * 插件自更新（git pull / 强制 reset / 更新日志）
 * 仅覆盖本插件目录，不改 Yunzai 本体
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { pluginPath, pluginName } from './path.js'
import { logInfo, logWarn, logError } from './log.js'

const execFileAsync = promisify(execFile)
let updating = false

function gitDir() {
  return path.join(pluginPath, '.git')
}

export function isGitRepo() {
  return fs.existsSync(gitDir())
}

export function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf8'))
    return String(pkg.version || '?')
  } catch {
    return '?'
  }
}

async function git(args, { timeout = 120000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: pluginPath,
      windowsHide: true,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return {
      ok: true,
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
    }
  } catch (err) {
    const stdout = String(err.stdout || '').trim()
    const stderr = String(err.stderr || err.message || '').trim()
    return {
      ok: false,
      stdout,
      stderr,
      code: err.code,
      error: err,
    }
  }
}

async function getCommitShort() {
  const r = await git(['rev-parse', '--short', 'HEAD'])
  return r.ok ? r.stdout : ''
}

async function getCommitTime() {
  const r = await git(['log', '-1', '--pretty=%cd', '--date=format:%F %T'])
  return r.ok ? r.stdout : ''
}

async function getBranch() {
  const r = await git(['branch', '--show-current'])
  return r.ok ? r.stdout : ''
}

async function getUpstream() {
  const r = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  return r.ok ? r.stdout : ''
}

async function getRemoteUrl() {
  const branch = await getBranch()
  if (branch) {
    const remoteName = await git(['config', `branch.${branch}.remote`])
    if (remoteName.ok && remoteName.stdout) {
      const url = await git(['config', `remote.${remoteName.stdout}.url`])
      if (url.ok) return url.stdout.replace(/\/\/([^@]+)@/, '//***@')
    }
  }
  const origin = await git(['config', 'remote.origin.url'])
  return origin.ok ? origin.stdout.replace(/\/\/([^@]+)@/, '//***@') : ''
}

function packageChanged(diffText = '') {
  return /package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock/i.test(diffText)
}

async function installDepsIfNeeded(changed) {
  if (!changed) return { ran: false, ok: true, message: '' }
  const hasPnpmLock = fs.existsSync(path.join(pluginPath, 'pnpm-lock.yaml'))
  const hasNpmLock = fs.existsSync(path.join(pluginPath, 'package-lock.json'))
  const cmd = hasPnpmLock ? 'pnpm' : 'npm'
  const args = hasPnpmLock
    ? ['install', '--prefer-offline']
    : hasNpmLock
      ? ['ci', '--omit=dev']
      : ['install', '--omit=dev']

  try {
    await execFileAsync(cmd, args, {
      cwd: pluginPath,
      windowsHide: true,
      timeout: 300000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
    })
    return { ran: true, ok: true, message: `依赖已更新（${cmd} ${args.join(' ')}）` }
  } catch (err) {
    const msg = String(err.stderr || err.message || err)
    logWarn(`依赖安装失败: ${msg}`)
    return { ran: true, ok: false, message: `依赖安装失败：${msg.slice(0, 200)}` }
  }
}

function formatGitError(stdout, stderr) {
  const text = `${stderr}\n${stdout}`.trim()
  if (/unable to access|无法访问|Could not resolve host|Failed to connect/i.test(text)) {
    return `远程仓库连接失败\n${text.slice(0, 300)}`
  }
  if (/Authentication failed|Permission denied|could not read Username/i.test(text)) {
    return `远程仓库鉴权失败，请检查 git 凭据\n${text.slice(0, 300)}`
  }
  if (/be overwritten by merge|Your local changes|需要合并|合并冲突|Merge conflict/i.test(text)) {
    return `本地有修改导致无法拉取，可备份后使用 #qqm强制更新\n${text.slice(0, 300)}`
  }
  if (/divergent branches|偏离/i.test(text)) {
    return `本地与远程分支已分叉，可尝试 #qqm强制更新\n${text.slice(0, 300)}`
  }
  if (/not a git repository/i.test(text)) {
    return '当前目录不是 git 仓库，无法在线更新'
  }
  return text.slice(0, 400) || '未知 git 错误'
}

/**
 * 更新插件
 * @param {{ force?: boolean }} opts
 */
export async function updatePlugin({ force = false } = {}) {
  if (updating) {
    return { ok: false, updating: true, message: '正在更新，请稍候再试' }
  }
  if (!isGitRepo()) {
    return {
      ok: false,
      message: `${pluginName} 不是 git 安装（缺少 .git），无法在线更新。\n请使用 git clone 安装，或手动覆盖文件。`,
    }
  }

  updating = true
  const type = force ? '强制更新' : '更新'
  const oldCommit = await getCommitShort()
  const oldVersion = getLocalVersion()
  const branch = await getBranch()
  const remoteUrl = await getRemoteUrl()

  logInfo(`开始${type} ${pluginName} @ ${oldCommit || '?'}`)

  try {
    // 先 fetch，拿最新引用
    const fetchRet = await git(['fetch', '--all', '--prune'], { timeout: 180000 })
    if (!fetchRet.ok && force) {
      // 强制更新仍可尝试用已有 origin/branch
      logWarn(`git fetch 失败，继续尝试本地远程引用: ${fetchRet.stderr || fetchRet.stdout}`)
    } else if (!fetchRet.ok) {
      return {
        ok: false,
        message: `拉取远程失败：${formatGitError(fetchRet.stdout, fetchRet.stderr)}`,
        remoteUrl,
        branch,
        oldCommit,
        oldVersion,
      }
    }

    let pullRet
    if (force) {
      let upstream = await getUpstream()
      if (!upstream) {
        const b = branch || 'main'
        upstream = `origin/${b}`
      }
      // 丢弃本地提交/改动，对齐远程
      const resetRet = await git(['reset', '--hard', upstream])
      if (!resetRet.ok) {
        // 兜底 origin/main / origin/master
        const fallbacks = ['origin/main', 'origin/master', upstream]
        let ok = false
        for (const ref of fallbacks) {
          const r = await git(['reset', '--hard', ref])
          if (r.ok) {
            ok = true
            pullRet = r
            break
          }
          pullRet = r
        }
        if (!ok) {
          return {
            ok: false,
            message: `强制更新失败：${formatGitError(pullRet?.stdout, pullRet?.stderr)}`,
            remoteUrl,
            branch,
            oldCommit,
            oldVersion,
          }
        }
      } else {
        pullRet = resetRet
      }
      // 清未跟踪但保留 config/config（用户配置）
      await git(['clean', '-fd', '-e', 'config/config', '-e', 'node_modules', '-e', 'temp'])
    } else {
      pullRet = await git(['pull', '--ff-only'])
      if (!pullRet.ok) {
        // 尝试普通 pull
        const soft = await git(['pull', '--rebase', '--autostash'])
        if (!soft.ok) {
          return {
            ok: false,
            message: `更新失败：${formatGitError(soft.stdout || pullRet.stdout, soft.stderr || pullRet.stderr)}\n提示：本地有改动可用 #qqm强制更新（会丢弃未提交修改）`,
            remoteUrl,
            branch,
            oldCommit,
            oldVersion,
          }
        }
        pullRet = soft
      }
    }

    const newCommit = await getCommitShort()
    const newVersion = getLocalVersion()
    const time = await getCommitTime()
    const out = `${pullRet.stdout}\n${pullRet.stderr}`.trim()
    const already =
      oldCommit && newCommit && oldCommit === newCommit && /Already up|已经是最新|up to date/i.test(out)

    // 对比是否动到依赖文件
    let depDiff = out
    if (oldCommit && newCommit && oldCommit !== newCommit) {
      const diff = await git(['diff', '--name-only', `${oldCommit}..${newCommit}`])
      if (diff.ok) depDiff = diff.stdout
    }
    const dep = await installDepsIfNeeded(packageChanged(depDiff) || packageChanged(out))

    const lines = [
      `【${pluginName} ${type}】`,
      already || (oldCommit && oldCommit === newCommit)
        ? '已是最新'
        : '更新成功',
      `版本: v${oldVersion}${oldVersion !== newVersion ? ` → v${newVersion}` : ''}`,
      `提交: ${oldCommit || '-'}${oldCommit !== newCommit ? ` → ${newCommit || '-'}` : ''}`,
      time ? `时间: ${time}` : '',
      branch ? `分支: ${branch}` : '',
      remoteUrl ? `仓库: ${remoteUrl}` : '',
      dep.ran ? dep.message : '',
      oldCommit !== newCommit ? '请发送 #重启 使插件代码生效' : '',
    ].filter(Boolean)

    // 最近变更摘要
    if (oldCommit && newCommit && oldCommit !== newCommit) {
      const log = await getUpdateLog({ since: oldCommit, limit: 8 })
      if (log.lines?.length) {
        lines.push('', `变更 ${log.lines.length} 条：`, ...log.lines.map((s) => `· ${s}`))
      }
    }

    logInfo(`${type}完成: ${oldCommit} -> ${newCommit}`)
    return {
      ok: true,
      already: Boolean(already || (oldCommit && oldCommit === newCommit)),
      changed: oldCommit !== newCommit,
      message: lines.join('\n'),
      oldCommit,
      newCommit,
      oldVersion,
      newVersion,
      time,
      branch,
      remoteUrl,
      dep,
    }
  } catch (err) {
    logError(`${type}异常: ${err.message}`)
    return { ok: false, message: `${type}异常：${err.message}` }
  } finally {
    updating = false
  }
}

/**
 * 更新日志
 * @param {{ since?: string, limit?: number }} opts
 */
export async function getUpdateLog({ since = '', limit = 15 } = {}) {
  if (!isGitRepo()) {
    return { ok: false, message: '不是 git 仓库，无法读取更新日志', lines: [] }
  }

  const pretty = '%h||%cd||%s'
  const args = ['log', `-n`, String(limit), `--pretty=${pretty}`, '--date=format:%F %T']
  const r = await git(args)
  if (!r.ok) {
    return { ok: false, message: formatGitError(r.stdout, r.stderr), lines: [] }
  }

  const lines = []
  for (const row of r.stdout.split('\n').filter(Boolean)) {
    const [hash, date, ...rest] = row.split('||')
    const subject = rest.join('||')
    if (since && hash === since) break
    if (/Merge branch|Merge pull request/i.test(subject)) continue
    lines.push(`${date || ''} ${subject}`.trim())
  }

  const version = getLocalVersion()
  const commit = await getCommitShort()
  const remoteUrl = await getRemoteUrl()
  const header = [
    `【${pluginName} 更新日志】`,
    `版本: v${version}  提交: ${commit || '-'}`,
    remoteUrl ? `仓库: ${remoteUrl}` : '',
    lines.length ? `最近 ${lines.length} 条：` : '暂无日志',
  ].filter(Boolean)

  return {
    ok: true,
    lines,
    message: [...header, ...lines.map((s, i) => `${i + 1}. ${s}`)].join('\n'),
  }
}
