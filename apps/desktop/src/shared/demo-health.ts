export interface DemoHealth {
  controls: number
  visual: number
  text: number
}

/** Self-contained so the identical measurement can run in both sandbox rigs. */
export function measureDemoDocument(): DemoHealth {
  const visible = (element: Element): boolean => {
    const bounds = element.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const css = getComputedStyle(node)
      if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false
    }
    return true
  }
  const controls = Array.from(document.querySelectorAll('button,[role=button],input,select,textarea,summary'))
    .filter(visible).length
  let visual = 0
  for (const element of document.querySelectorAll('svg path,svg circle,svg ellipse,svg rect,svg line,svg polyline,svg polygon,svg text,canvas,img,table,pre')) {
    if (element.closest('defs,clipPath,mask,symbol,button,[role=button]') || !visible(element)) continue
    if (element.tagName === 'IMG' && !(element as HTMLImageElement).naturalWidth) continue
    if (element.tagName === 'PRE' && !element.textContent?.trim()) continue
    visual++
  }
  // Generated diagrams also use CSS bars, cells and positioned boxes. Count
  // visible painted leaves, not the demo's outer card or its control buttons.
  for (const element of document.querySelectorAll('body *')) {
    if (element.parentElement === document.body || element.childElementCount || element.closest('svg,button,[role=button],select,textarea,summary,pre,table')) continue
    if (!visible(element)) continue
    const bounds = element.getBoundingClientRect()
    if (bounds.width < 6 || bounds.height < 6) continue
    const css = getComputedStyle(element)
    const color = css.backgroundColor
    const painted = color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)'
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
      parseFloat(css.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
      !['none', 'hidden'].includes(css.getPropertyValue(`border-${side.toLowerCase()}-style`)))
    if (painted || css.backgroundImage !== 'none' || border) visual++
  }
  return { controls, visual, text: (document.body?.innerText ?? '').trim().length }
}
