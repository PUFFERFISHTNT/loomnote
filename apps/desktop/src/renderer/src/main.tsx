import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'
import './styles.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)