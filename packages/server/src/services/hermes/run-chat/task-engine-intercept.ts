import { contentBlocksToString } from './content-blocks'
import type { ContentBlock } from './types'

export type TaskEngineMode = 'RESEARCH' | 'DECISION' | 'RESEARCH_DECISION'
export type TaskEngineAction =
  | 'full'
  | 'dry-run'
  | 'simulated-run'
  | 'contract'
  | 'validate'
  | 'render'
  | 'agy-preflight'
  | 'omlx-preflight'
  | 'mechanism-check'
  | 'status'

export interface TaskEngineRunnerRequest {
  query: string
  mode: TaskEngineMode
  action: TaskEngineAction
  research_packet_path?: string
  base_dir?: string
  execution_intent?: 'production_full' | 'dry_run' | 'mechanism_test'
}

export type TaskEngineIntercept =
  | { kind: 'none' }
  | { kind: 'invalid'; error: string; text: string }
  | { kind: 'valid'; request: TaskEngineRunnerRequest; text: string }

const ALLOWED_ACTIONS = new Set<TaskEngineAction>([
  'full',
  'dry-run',
  'simulated-run',
  'contract',
  'validate',
  'render',
  'agy-preflight',
  'omlx-preflight',
  'mechanism-check',
  'status',
])

const MODE_PATTERN = String.raw`(?:RESEARCH_DECISION|RESEARCH|DECISION)`
const ACTION_PATTERN = String.raw`(?:full|full-run|dry-run|dry_run|simulated-run|simulated_run|contract|validate|render|agy-preflight|agy_preflight|omlx-preflight|omlx_preflight|mechanism-check|mechanism_check|status|smoke-[a-z0-9-]+)`

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function hasTaskEngineDispatchMarker(text: string): boolean {
  if (/\btask_engine_runner\b/i.test(text)) return true
  if (/\btask[-_\s]?engine(?:[-_\s]?runner)?\b/i.test(text)) return true
  const structuredMode = new RegExp(String.raw`(?:^|\n)\s*mode\s*[:=：]\s*${MODE_PATTERN}\b`, 'i').test(text)
  const structuredAction = new RegExp(String.raw`(?:^|\n)\s*action\s*[:=：]\s*${ACTION_PATTERN}\b`, 'i').test(text)
  if (structuredMode && structuredAction) return true
  return /\b(?:RESEARCH_DECISION|RESEARCH|DECISION)\b[^\n]{0,120}\bfull[-\s]?run\b/i.test(text)
}

function parseMode(text: string): TaskEngineMode | null {
  const structured = text.match(new RegExp(String.raw`(?:^|\n)\s*mode\s*[:=：]\s*(${MODE_PATTERN})\b`, 'i'))
  const raw = structured?.[1] || text.match(/\b(RESEARCH_DECISION|RESEARCH|DECISION)\b/i)?.[1]
  if (raw) {
    const normalized = raw.toUpperCase().replace(/-/g, '_')
    if (normalized === 'RESEARCH_DECISION' || normalized === 'RESEARCH' || normalized === 'DECISION') {
      return normalized
    }
  }
  if (/研究\s*决策/.test(text)) return 'RESEARCH_DECISION'
  if (/决策/.test(text)) return 'DECISION'
  if (/研究/.test(text)) return 'RESEARCH'
  return null
}

function normalizeAction(raw: string): TaskEngineAction | 'smoke' | null {
  const normalized = raw.trim().toLowerCase().replace(/_/g, '-')
  if (normalized.startsWith('smoke-')) return 'smoke'
  const action = normalized === 'full-run' ? 'full' : normalized
  return ALLOWED_ACTIONS.has(action as TaskEngineAction) ? action as TaskEngineAction : null
}

function parseAction(text: string): TaskEngineAction | 'smoke' | null {
  const structured = text.match(new RegExp(String.raw`(?:^|\n)\s*action\s*[:=：]\s*(${ACTION_PATTERN})\b`, 'i'))
  if (structured?.[1]) return normalizeAction(structured[1])
  const inline = text.match(new RegExp(String.raw`\b(${ACTION_PATTERN})\b`, 'i'))
  if (inline?.[1]) return normalizeAction(inline[1])
  if (/full[-\s]?run/i.test(text) || /production\s+full/i.test(text)) return 'full'
  return null
}

function parsePathAfterLabel(text: string, label: RegExp): string | undefined {
  const match = text.match(label)
  const value = match?.[1]?.trim()
  return value || undefined
}

function parseResearchPacketPath(text: string): string | undefined {
  return parsePathAfterLabel(text, /research_packet_path\s*[:=：]\s*([^\s"'`]+)/i)
    || parsePathAfterLabel(text, /(?:Stage A packet|research evidence packet|research_evidence_packet)\s*[:：]\s*\n\s*([^\s"'`]+research_evidence_packet\.md)/i)
}

function parseArtifactDir(text: string): string | undefined {
  return parsePathAfterLabel(text, /(?:artifact_dir|Artifact Dir)\s*[:=：]\s*([^\s"'`]+)/i)
}

export function detectTaskEngineIntercept(input: string | ContentBlock[]): TaskEngineIntercept {
  const text = normalizeText(contentBlocksToString(input))
  if (!text || !hasTaskEngineDispatchMarker(text)) return { kind: 'none' }

  const mode = parseMode(text)
  if (!mode) {
    return { kind: 'invalid', text, error: 'task_engine_runner intercept requires explicit mode: RESEARCH, DECISION, or RESEARCH_DECISION' }
  }

  const action = parseAction(text)
  if (!action) {
    return { kind: 'invalid', text, error: 'task_engine_runner intercept requires explicit action' }
  }
  if (action === 'smoke') {
    return { kind: 'invalid', text, error: 'task_engine_runner intercept does not allow smoke actions' }
  }

  const researchPacketPath = parseResearchPacketPath(text)
  if (mode === 'DECISION' && action === 'full' && !researchPacketPath) {
    return { kind: 'invalid', text, error: 'research_packet_path is required for DECISION full task_engine_runner intercept' }
  }

  const baseDir = parseArtifactDir(text)
  const executionIntent = action === 'full'
    ? 'production_full'
    : action === 'dry-run'
      ? 'dry_run'
      : action === 'mechanism-check'
        ? 'mechanism_test'
        : undefined

  return {
    kind: 'valid',
    text,
    request: {
      query: text,
      mode,
      action,
      ...(researchPacketPath ? { research_packet_path: researchPacketPath } : {}),
      ...(baseDir ? { base_dir: baseDir } : {}),
      ...(executionIntent ? { execution_intent: executionIntent } : {}),
    },
  }
}

export function taskEngineTimeoutMs(action: TaskEngineAction): number {
  if (action === 'dry-run' || action === 'contract' || action === 'validate' || action === 'status' || action === 'mechanism-check') return 60_000
  if (action === 'simulated-run' || action === 'agy-preflight' || action === 'omlx-preflight') return 120_000
  return 6 * 60 * 60 * 1000
}

export function renderTaskEngineInterceptMarkdown(args: {
  request: TaskEngineRunnerRequest
  result: unknown
}): string {
  let parsed: unknown = args.result
  if (typeof args.result === 'string') {
    try {
      parsed = args.result.trim() ? JSON.parse(args.result) : null
    } catch {
      parsed = { status: 'ok', raw_output: args.result }
    }
  }
  const statusLines = [
    'deterministic_intercept=true',
    'model_bypassed=true',
    `intercepted_mode=${args.request.mode}`,
    `task_engine_runner_action=${args.request.action}`,
    'runner_entrypoint=registered_task_engine_runner',
  ]
  const markdown = typeof (parsed as any)?.markdown === 'string' ? (parsed as any).markdown : ''
  const payload = JSON.stringify(parsed, null, 2)
  return `${statusLines.join('\n')}\n\n\`\`\`json\n${payload}\n\`\`\`${markdown ? `\n\n${markdown}` : ''}`
}
