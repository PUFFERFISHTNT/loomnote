/** Only explicit, persistent instructions become preferences; source documents never do. */
export function rememberedPreference(text: string): string | null {
  const clean = text.replace(/^\[[^\]]+\]\s*/, '').trim()
  const match = /^(?:please\s+)?(?:remember(?:\s+this)?(?:\s*[:：,，-]\s*|\s+)|from now on[,:]?\s+|always\s+|记住[：:,，]?\s*|以后(?:都|请)?\s*|今后(?:都|请)?\s*)([\s\S]+)$/i.exec(clean)
  return match?.[1]?.trim().slice(0, 1000) || null
}

export function appendPreference(existing: string, preference: string): string {
  const lines = existing.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!lines.some((s) => s.replace(/^-\s*/, '').toLowerCase() === preference.toLowerCase())) lines.push(`- ${preference}`)
  return lines.join('\n').slice(-8000)
}
