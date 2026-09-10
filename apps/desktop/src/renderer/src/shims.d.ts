declare module 'katex/dist/contrib/auto-render.mjs' {
  interface AutoRenderOptions {
    delimiters?: Array<{ left: string; right: string; display: boolean }>
    throwOnError?: boolean
  }
  const renderMathInElement: (el: HTMLElement, opts?: AutoRenderOptions) => void
  export default renderMathInElement
}
