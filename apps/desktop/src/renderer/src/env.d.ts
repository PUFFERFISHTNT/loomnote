import type { LoomnoteApi } from '../../shared/ipc.js'

declare global {
  interface Window {
    loomnote: LoomnoteApi
  }
}

export {}
declare module 'katex/dist/contrib/auto-render.mjs' {
  const renderMathInElement: (el: HTMLElement, opts?: {
    delimiters?: Array<{ left: string; right: string; display: boolean }>
    throwOnError?: boolean
  }) => void
  export default renderMathInElement
}
