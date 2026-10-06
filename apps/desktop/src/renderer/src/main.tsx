import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { initLang } from './i18n.js'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'
import './styles.css'

// 语言在第一次渲染前就确定：localStorage 优先，其次主进程（LOOMNOTE_LANG / 系统语言）
initLang(window.loomnote?.defaultLang ?? 'en')

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)