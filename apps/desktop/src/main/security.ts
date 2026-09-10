import { app, shell } from 'electron'

/** 主进程安全基线（07 §3）：will-navigate 拦截、新窗全拒、权限默认拒绝、外链协议白名单。 */
export function installSecurityHandlers(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault()
    })
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      // 开发测试版仅放行剪贴板读取；其余一律拒绝
      callback(permission === 'clipboard-read')
    })
  })
}

function isAllowedNavigation(url: string): boolean {
  if (url.startsWith('devtools://')) return true
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return true
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  } catch {
    return false
  }
  return false
}

export function openExternalSafe(url: string): void {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(url)
  } catch {
    /* ignore */
  }
}