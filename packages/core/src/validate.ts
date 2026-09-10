export interface ValidationIssue {
  rule: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

interface Rule {
  name: string
  re: RegExp
  message: string
}

/** AI 生成 HTML 的纪律校验器（07 §2 B2/C4）：外联=0、禁 backdrop-filter、禁外联脚本、禁窗口逃逸、需要根容器。 */
const RULES: Rule[] = [
  {
    name: 'external-resource',
    re: /<(?:img|script|link|iframe|source|video|audio|form|object|embed)[^>]*?\b(?:src|href|action)\s*=\s*["']?https?:\/\//i,
    message: '禁止外联 http(s) 资源（数据不得出本机）'
  },
  { name: 'external-fetch', re: /fetch\s*\(\s*["']?https?:\/\//i, message: '禁止 fetch 外域' },
  { name: 'backdrop-filter', re: /backdrop-filter\s*:/i, message: '禁止 backdrop-filter（渲染铁律）' },
  { name: 'script-src', re: /<script[^>]+src\s*=/i, message: '禁止外联脚本，仅允许内联脚本' },
  { name: 'window-open', re: /window\.open\s*\(/i, message: '禁止 window.open' },
  { name: 'navigation', re: /location\.(?:href|assign|replace)\s*=/i, message: '禁止脚本导航本机页面' }
]

export function validateDemoHtml(html: string): ValidationResult {
  const issues: ValidationIssue[] = []
  const text = html ?? ''
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    issues.push({ rule: 'no-element', message: '内容不含任何 HTML 元素' })
  }
  if (!/<\s*div\b/i.test(text)) {
    issues.push({ rule: 'root-container', message: '缺少根 div 容器（唯一根 + 前缀隔离要求）' })
  }
  for (const rule of RULES) {
    if (rule.re.test(text)) issues.push({ rule: rule.name, message: rule.message })
  }
  return { ok: issues.length === 0, issues }
}