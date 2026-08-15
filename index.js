/**
 * dsh-open-browser
 *
 * 在 dsh Web UI 启动成功后，自动在浏览器中打开页面。
 * - 注入 `webRuntime` 服务：该服务由 dsh-web-app 在 Web 服务器绑定后提供，
 *   因此只在「服务器已成功启动」之后才激活；
 * - 与 dsh-web-app 打印 URL 行同样的就绪语义：等待 Loader 结算后再打开，
 *   启动失败（结算被拒绝）则保持安静；
 * - 打开策略：Windows / macOS / Linux 统一「Chrome/Chromium 优先，
 *   找不到回退系统默认浏览器」，各自维护候选链，命中第一个可用者即执行。
 *
 * 本文件是从 src/open-browser.ts 转译的无类型分发入口；改动请改源码。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export const name = 'open-browser'
export const inject = ['webRuntime']

/** Windows 下常见的 Chrome 安装根目录 → chrome.exe 绝对路径。 */
const winChrome = [
  process.env.PROGRAMW6432,
  process.env.PROGRAMFILES,
  process.env['PROGRAMFILES(X86)'],
  process.env.LOCALAPPDATA,
]
  .filter((p) => Boolean(p))
  .map((root) => ({ file: `${root}\\Google\\Chrome\\Application\\chrome.exe` }))

/** macOS 下 Chrome 的常见位置（系统级 / 用户级）。 */
const macChrome = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ...(process.env.HOME
    ? [`${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`]
    : []),
].map((file) => ({ file }))

/** Linux 下 Chrome/Chromium 的常见命令与绝对路径。 */
const linuxChrome = [
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
const WIN_FALLBACK = { file: 'cmd.exe', args: (url) => ['/c', 'start', '', url] }
const MAC_FALLBACK = { file: 'open' }
const LINUX_FALLBACK = [
  { file: 'xdg-open' },
  { file: 'gio', args: (url) => ['open', url] },
  { file: 'sensible-browser' },
]

const PLATFORM_CANDIDATES = {
  win32: [...winChrome, WIN_FALLBACK],
  darwin: [...macChrome, MAC_FALLBACK],
  linux: [...linuxChrome, ...LINUX_FALLBACK],
}

/** 判断可执行文件是否存在：含路径分隔符时按路径探测，否则扫 PATH。 */
function commandExists(file) {
  if (file.includes('/') || file.includes('\\')) return existsSync(file)
  const dirs = (process.env.PATH ?? '').split(delimiter)
  return dirs.some((dir) => dir !== '' && existsSync(join(dir, file)))
}

/** 在系统浏览器中打开 URL；detached + stdio ignore，不拖住 dsh 进程。 */
function openBrowser(url) {
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

export function apply(ctx) {
  // webServer 由 dsh-web-app 的兄弟行提供；它存在才说明服务器真的绑定了。
  const webServer = ctx.get('webServer')
  if (webServer?.port === undefined) return
  const url = `http://127.0.0.1:${String(webServer.port)}`

  const open = () => {
    // 启动过程中整棵树可能已被销毁（如提前退出）：此时不再打开，避免误导。
    if (ctx.get('webServer') !== undefined) {
      console.log(`[open-browser] opening ${url}`)
      openBrowser(url)
    }
  }

  // 与 dsh-web-app 的 URL 行同样的就绪语义：等 Loader 结算后再打开。
  const settled = ctx.get('loader')?.await?.()
  if (settled === undefined) open()
  else void settled.then(open, () => {})
}
