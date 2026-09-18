import { builtinCalcTool, builtinWebFetchTool, OpenAICompatProvider, runTask, ToolRegistry } from '@loomnote/agent'
import type { MemoryEngine } from '@loomnote/memory'
import type { AgentEvent } from '@loomnote/core'
import type { AppDb } from './db.js'
import { getActiveProvider, type Settings } from '../shared/ipc.js'

export interface AgentHost {
  run(task: string, onEvent: (e: AgentEvent) => void): Promise<{ output: string; steps: number; toolCalls: number }>
  cancel(): void
}

/** Harness Agent 宿主：loop + 工具注册表 + OpenAI 兼容 Provider + AbortController（可打断）。 */
export function createAgentHost(db: AppDb, memory: MemoryEngine, getSettings: () => Settings): AgentHost {
  let currentController: AbortController | null = null
  return {
    cancel() {
      currentController?.abort()
    },
    async run(task, onEvent) {
      const s = getSettings()
      const p = getActiveProvider(s)
      if (!p.apiKey) throw new Error('尚未配置 LLM API Key，请到「设置」填写（当前接口：' + p.name + '）')
      const provider = new OpenAICompatProvider({ baseURL: p.baseURL, apiKey: p.apiKey, model: p.model, maxTokens: p.maxTokens })
      const registry = new ToolRegistry()
      registry.register(builtinCalcTool)
      if (s.webEnabled) registry.register(builtinWebFetchTool)
      registry.register({
        name: 'recall_memory',
        description: '按关键词召回本地记忆（知识点/偏好），返回摘要文本',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        risk: 'none',
        needsApproval: false,
        run: (args) => {
          const pkg = memory.buildPackage(String((args as { q?: string }).q ?? ''))
          return pkg.text || '（本地暂无相关记忆）'
        }
      })
      registry.register({
        name: 'read_note',
        description: '读取一篇笔记的 Markdown 原文',
        parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        risk: 'none',
        needsApproval: false,
        run: (args) => {
          const note = db.getNote(String((args as { id?: string }).id ?? ''))
          return note ? note.bodyMd : '（未找到该笔记）'
        }
      })

      const controller = new AbortController()
      currentController = controller
      try {
        const res = await runTask(task, {
          provider,
          registry,
          signal: controller.signal,
          systemPrompt:
            '你是「织记」的学习 agent，自主把资料整理成「md+html 混合」的学习笔记。规则：' +
            '1) 结构：主标题 → :::toc → 章节（正文/表格/公式 $$）/速记卡/自测题；' +
            '2) 【混合渲染】在概念适合可视化处（排队、栈/队列、递归树、概率实验、算法过程等）或用户着重要求处，你必须主动插入交互演示块：' +
            '   单独一行 :::demo 演示标题，接着输出完整自包含 HTML（全部内联 <style>与<script>、禁止外部资源、单根 <div>、可点击分步/动画），最后单独一行 ::: 收束；' +
            '3) 需要查证时调用 web_fetch / calc / recall_memory / read_note 工具，结果回来后继续输出；' +
            '4) 用户提出的需求优先级最高；直接输出最终 Markdown，不要解释。',
          maxSteps: 6,
          maxToolCalls: 3,
          onEvent
        })
        return { output: res.output, steps: res.steps, toolCalls: res.toolCalls }
      } finally {
        if (currentController === controller) currentController = null
      }
    }
  }
}