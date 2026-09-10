import { validateDemoHtml, type ValidationResult } from '@loomnote/core'

/** 演示沙箱三件套之一：不可变 meta CSP（07 §2）——封死外联，数据不出本机。 */
export const DEMO_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;"

/** 帧内桥接引导脚本：接收父页 MessageChannel port2。 */
const BRIDGE_BOOT = `<script>(()=>{window.addEventListener('message',(e)=>{if(e.ports&&e.ports[0]){window.__loomnotePort=e.ports[0];window.__loomnotePort.postMessage({type:'bridge-ready'})}})})()</script>`

export function buildDemoSrcdoc(html: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${DEMO_CSP}">${BRIDGE_BOOT}${html}`
}

/**
 * data: URL 形式的演示文档：data: 文档**不继承**父页面 CSP（srcdoc 会继承并取交集，
 * 曾导致演示被父页 default-src 'self' 静默拦截成空白）——只受注入的沙箱 CSP 管辖。
 */
export function buildDemoDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildDemoSrcdoc(html))}`
}

export function checkDemo(html: string): ValidationResult {
  return validateDemoHtml(html)
}