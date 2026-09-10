import { useApp } from '../stores/app.js'

/** 全局错误提示（顶部深色 toast，可手动关闭，10s 自动消失）。 */
export function Toast() {
  const error = useApp((s) => s.error)
  const clearError = useApp((s) => s.clearError)

  useEffectAutoDismiss(error, clearError)
  if (!error) return null
  return (
    <div className="toast">
      <span>⚠</span>
      <span style={{ flex: 1 }}>{error}</span>
      <button onClick={clearError}>✕</button>
    </div>
  )
}

import { useEffect } from 'react'
function useEffectAutoDismiss(error: string | null, clear: () => void) {
  useEffect(() => {
    if (!error) return
    const t = setTimeout(clear, 10000)
    return () => clearTimeout(t)
  }, [error, clear])
}