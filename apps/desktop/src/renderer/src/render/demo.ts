import { validateDemoHtml, type ValidationResult } from '@loomnote/core'

/** 演示沙箱三件套之一：不可变 meta CSP（07 §2）——封死外联，数据不出本机。 */
export const DEMO_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;"

/**
 * 帧内引导脚本：
 *  1) 接收父页 MessageChannel port2（结构化桥接事件）；
 *  2) 主动把内容高度 postMessage 给父页 —— 不依赖握手时序，父页据此自动定高。
 */
const BRIDGE_BOOT = `<script>(()=>{var report=()=>{try{var b=document.body;var m=0;if(b){var kids=b.children;for(var i=0;i<kids.length;i++){var r=kids[i].getBoundingClientRect();if(r.bottom>m)m=r.bottom}var cs=getComputedStyle(b);m+=parseFloat(cs.paddingBottom)||0;m+=parseFloat(cs.marginBottom)||0}window.parent.postMessage({__loomnote:'resize',height:Math.ceil(m)},'*')}catch(e){}};var raf=0;var queue=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;report()})};try{new ResizeObserver(queue).observe(document.documentElement)}catch(e){}window.addEventListener('load',queue);document.addEventListener('click',()=>setTimeout(queue,0));setTimeout(queue,0);setTimeout(queue,80);setTimeout(queue,500);window.addEventListener('message',(e)=>{if(!e.ports||!e.ports[0])return;window.__loomnotePort=e.ports[0];window.__loomnotePort.postMessage({type:'bridge-ready'})})})()</script>`

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