/**
 * 本地功能插件：dsh Web UI 启动成功后，自动在浏览器中打开页面。
 *
 * 原理：
 * - 注入 `webRuntime` 服务 —— 该服务由 dsh-web-app 在 Web 服务器绑定后提供，
 *   因此本插件只在「服务器已成功启动」之后才激活；
 * - 参考 dsh-web-app 打印 URL 行的就绪逻辑：等待 Loader 结算（整棵树挂载完成）
 *   后再打开浏览器，启动失败（结算被拒绝）则保持安静；
 * - 打开逻辑：三个平台统一「Chrome/Chromium 优先，找不到回退系统默认浏览器」。
 *   Windows / macOS / Linux 各自维护候选链，命中第一个可用者即执行；
 *   全部不可用则只记日志，不打断 dsh 启动。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'open-browser'
export const inject = ['webRuntime']

interface BrowserCandidate {
  /** 可执行文件的绝对路径，或可在 PATH 中解析的命令名。 */
  file: string
  /** 打开 URL 的参数列表；缺省为 [url]。 */
  args?: (url: string) => string[]
}

/** 判断可执行文件是否存在：含路径分隔符时按路径探测，否则扫 PATH。 */
function commandExists(file: string): boolean {
  if (file.includes('/') || file.includes('\\')) return existsSync(file)
  const dirs = (process.env.PATH ?? '').split(delimiter)
  return dirs.some((dir) => dir !== '' && existsSync(join(dir, file)))
}

/** Windows 下常见的 Chrome 安装根目录 → chrome.exe 绝对路径。 */
const winChrome: BrowserCandidate[] = [
  process.env.PROGRAMW6432,
  process.env.PROGRAMFILES,
  process.env['PROGRAMFILES(X86)'],
  process.env.LOCALAPPDATA,
]
  .filter((p): p is string => Boolean(p))
  .map((root) => ({ file: `${root}\\Google\\Chrome\\Application\\chrome.exe` }))

/** macOS 下 Chrome 的常见位置（系统级 / 用户级）。 */
const macChrome: BrowserCandidate[] = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ...(process.env.HOME
    ? [`${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`]
    : []),
].map((file) => ({ file }))

/** Linux 下 Chrome/Chromium 的常见命令与绝对路径。 */
const linuxChrome: BrowserCandidate[] = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
].map((file) => ({ file }))

/** 各平台的回退：系统默认浏览器。 */
const WIN_FALLBACK: BrowserCandidate = { file: 'cmd.exe', args: (url) => ['/c', 'start', '', url] }
const MAC_FALLBACK: BrowserCandidate = { file: 'open' }
const LINUX_FALLBACK: BrowserCandidate[] = [
  { file: 'xdg-open' },
  { file: 'gio', args: (url) => ['open', url] },
  { file: 'sensible-browser' },
]

const PLATFORM_CANDIDATES: Partial<Record<NodeJS.Platform, BrowserCandidate[]>> = {
  win32: [...winChrome, WIN_FALLBACK],
  darwin: [...macChrome, MAC_FALLBACK],
  linux: [...linuxChrome, ...LINUX_FALLBACK],
}

/** 在系统浏览器中打开 URL；detached + stdio ignore，不拖住 dsh 进程。 */
function openBrowser(url: string): void {
  const candidates = PLATFORM_CANDIDATES[process.platform]
  if (!candidates?.length) {
    console.error(`[open-browser] unsupported platform: ${process.platform}`)
    return
  }
  const chosen = candidates.find((c) => commandExists(c.file))
  if (!chosen) {
    console.error(`[open-browser] no browser launcher found on ${process.platform}`)
    return
  }
  const args = chosen.args ? chosen.args(url) : [url]
  // 打开失败只记日志，不打断 dsh 启动流程。
  spawn(chosen.file, args, { detached: true, stdio: 'ignore' }).on('error', (err) => {
    console.error(`[open-browser] failed to launch ${chosen.file}: ${String(err)}`)
  })
}

export function apply(ctx: Context): void {
  // webServer 由 dsh-web-app 的兄弟行提供；它存在才说明服务器真的绑定了。
  const webServer = ctx.get('webServer') as { port?: number } | undefined
  if (webServer?.port === undefined) return
  const url = `http://127.0.0.1:${String(webServer.port)}`

  const open = (): void => {
    // 启动过程中整棵树可能已被销毁（如提前退出）：此时不再打开，避免误导。
    if (ctx.get('webServer') !== undefined) {
      console.log(`[open-browser] opening ${url}`)
      openBrowser(url)
    }
  }

  // 与 dsh-web-app 的 URL 行同样的就绪语义：等 Loader 结算后再打开。
  const settled = (ctx.get('loader') as { await(): Promise<unknown> } | undefined)?.await()
  if (settled === undefined) open()
  else void settled.then(open, () => {})
}
