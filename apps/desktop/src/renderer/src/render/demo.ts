import { validateDemoHtml, type ValidationResult } from '@loomnote/core'

/** 演示沙箱三件套之一：不可变 meta CSP（07 §2）——封死外联，数据不出本机。 */
export const DEMO_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;"

/**
 * The frame's bootstrap, injected ahead of the demo's own markup.
 *
 * It reports the frame's height so the parent can size it, hands the parent a
 * `MessageChannel` port for structured events, and answers two commands:
 *
 * - `probe` lists the demo's interactive controls, so the app can tell a demo
 *   that does something from one that is a picture (check 5 of the proposal's
 *   test set).
 * - `click` presses one by index. That is how a demo can be exercised without a
 *   human — used by the scripted walkthrough, and available to the automated
 *   "the demo still plays" check.
 *
 * Both are ordinary `click()` calls on the demo's own elements, so the demo's
 * own handler runs exactly as it would for a reader.
 */
const BRIDGE_BOOT = `<script>(()=>{var SEL='button,[role=button],input[type=button],input[type=submit],summary';var controls=()=>{try{return Array.prototype.slice.call(document.querySelectorAll(SEL))}catch(e){return[]}};var report=()=>{try{var b=document.body;var m=0;if(b){var kids=b.children;for(var i=0;i<kids.length;i++){var r=kids[i].getBoundingClientRect();if(r.bottom>m)m=r.bottom}var cs=getComputedStyle(b);m+=parseFloat(cs.paddingBottom)||0;m+=parseFloat(cs.marginBottom)||0}window.parent.postMessage({__loomnote:'resize',height:Math.ceil(m)},'*')}catch(e){}};var raf=0;var queue=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;report()})};try{new ResizeObserver(queue).observe(document.documentElement)}catch(e){}window.addEventListener('load',queue);document.addEventListener('click',()=>setTimeout(queue,0));setTimeout(queue,0);setTimeout(queue,80);setTimeout(queue,500);var outbox=[],say=function(m){try{if(!window.__loomnotePort){outbox.push(m);return}window.__loomnotePort.postMessage(m)}catch(e){}};var flush=function(){var q=outbox;outbox=[];for(var k=0;k<q.length;k++)say(q[k])};var announce=function(){try{window.parent.postMessage({__loomnote:'hello'},'*')}catch(e){}};window.addEventListener('load',announce);announce();setTimeout(announce,250);setTimeout(announce,900);var onErr=function(e){say({type:'demo-error',message:String((e&&(e.message||e.error))||'script error').slice(0,200)})};window.addEventListener('error',onErr);window.addEventListener('unhandledrejection',function(e){say({type:'demo-error',message:('unhandled rejection: '+String(e&&e.reason)).slice(0,200)})});setTimeout(function(){try{var controls=document.querySelectorAll(SEL).length;var visual=document.querySelectorAll('svg *,canvas,img,table,pre').length;var text=(document.body.innerText||'').trim().length;say({type:'demo-health',message:'ready='+document.readyState+' controls='+controls+' visual='+visual+' text='+text});if(visual===0&&controls===0)say({type:'demo-error',message:'the demo rendered nothing'});}catch(e){say({type:'demo-error',message:'health check failed: '+e})}},1500);window.addEventListener('message',function(e){var d=e.data||{};if(e.ports&&e.ports[0]){window.__loomnotePort=e.ports[0];say({type:'bridge-ready'});flush();return}if(d.__loomnote==='probe'){var els=controls();say({type:'controls',message:String(els.length)+' control(s): '+els.slice(0,4).map(function(el){return String(el.textContent||el.value||el.tagName).trim().slice(0,24)}).join(' | ')});return}if(d.__loomnote==='click'){var list=controls();var el=null;if(d.match){var re=new RegExp(d.match,'i');for(var i=0;i<list.length;i++){if(re.test(String(list[i].textContent||list[i].value||''))){el=list[i];break}}}else{el=list[d.index||0]}if(!el){say({type:'demo-click',message:'no control matched '+(d.match||d.index||0)});return}el.click();setTimeout(queue,0);say({type:'demo-click',message:String(el.textContent||el.value||el.tagName).trim().slice(0,32)})}})})()</script>`

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