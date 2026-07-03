import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { AgentBridgeClient } from '../../packages/server/src/services/hermes/agent-bridge'
import { detectTaskEngineIntercept } from '../../packages/server/src/services/hermes/run-chat/task-engine-intercept'

const STAGE_A_PACKET = '/Users/xqdwww/Workspace/AI_Core/hermes-agent-research-decision/.hermes_task_engine_runs/1782891050_research_research_l1_l5/L5_deepseek_acceptance/research_evidence_packet.md'
const DECISION_RUN_DIR = '/Users/xqdwww/Workspace/AI_Core/hermes-agent-research-decision/.hermes_task_engine_runs/1783035113_decision_decision_full'
const FINAL_REPORT = `${DECISION_RUN_DIR}/final_controller_report/final_decision_report.md`

describe('task engine chat intercept', () => {
  it('recognizes Chinese natural language DECISION full example 1', () => {
    const result = detectTaskEngineIntercept(
      `跑一下 ADHD Golden Case 的 DECISION full 稳定性复跑，使用这个 research packet：${STAGE_A_PACKET}。问题是：AI 信息环境下，ADHD 儿童特征的未来结构性反转与长期发展决策。`,
    )

    expect(result.kind).toBe('valid')
    if (result.kind !== 'valid') return
    expect(result.request).toMatchObject({
      mode: 'DECISION',
      action: 'full',
      query: 'AI 信息环境下，ADHD 儿童特征的未来结构性反转与长期发展决策。',
      research_packet_path: STAGE_A_PACKET,
      execution_intent: 'production_full_async',
    })
  })

  it('recognizes Chinese natural language DECISION full example 2', () => {
    const result = detectTaskEngineIntercept(
      `用 task_engine_runner 跑 DECISION full。query 是：AI 信息环境下，ADHD 儿童特征的未来结构性反转与长期发展决策。research_packet_path 是：${STAGE_A_PACKET}。`,
    )

    expect(result.kind).toBe('valid')
    if (result.kind !== 'valid') return
    expect(result.request).toMatchObject({
      mode: 'DECISION',
      action: 'full',
      query: 'AI 信息环境下，ADHD 儿童特征的未来结构性反转与长期发展决策。',
      research_packet_path: STAGE_A_PACKET,
      execution_intent: 'production_full_async',
    })
  })

  it('recognizes English run DECISION full text', () => {
    const result = detectTaskEngineIntercept(
      `Run DECISION full with research_packet_path: ${STAGE_A_PACKET}. query: AI information environment ADHD structural reversal.`,
    )

    expect(result.kind).toBe('valid')
    if (result.kind !== 'valid') return
    expect(result.request).toMatchObject({
      mode: 'DECISION',
      action: 'full',
      query: 'AI information environment ADHD structural reversal.',
      research_packet_path: STAGE_A_PACKET,
      execution_intent: 'production_full_async',
    })
  })

  it('recognizes Chinese natural language DECISION full example 3', () => {
    const result = detectTaskEngineIntercept(
      `请启动 Research/Decision 的 DECISION full，研究包路径是 ${STAGE_A_PACKET}，主题是 AI 信息环境下 ADHD 儿童特征的未来结构性反转。`,
    )

    expect(result.kind).toBe('valid')
    if (result.kind !== 'valid') return
    expect(result.request).toMatchObject({
      mode: 'DECISION',
      action: 'full',
      query: 'AI 信息环境下 ADHD 儿童特征的未来结构性反转。',
      research_packet_path: STAGE_A_PACKET,
      execution_intent: 'production_full_async',
    })
  })

  it('recognizes explicit DECISION full dispatch from ordinary chat text', () => {
    const result = detectTaskEngineIntercept(`
这是一个 DECISION production full-run 任务。请走 live Hermes task_engine_runner full。
请运行这个任务。

research_packet_path:
${STAGE_A_PACKET}

query:
AI 信息环境下，ADHD 儿童特征的未来结构性反转与长期发展决策
`)

    expect(result.kind).toBe('valid')
    if (result.kind !== 'valid') return
    expect(result.request).toMatchObject({
      mode: 'DECISION',
      action: 'full',
      research_packet_path: STAGE_A_PACKET,
      execution_intent: 'production_full_async',
    })
    expect(result.request.query).toBe('AI 信息环境下，ADHD 儿童特征的未来结构性反转与长期发展决策')
  })

  it('does not intercept ordinary WebUI chat', () => {
    const result = detectTaskEngineIntercept('帮我把这个页面的按钮颜色改成蓝色，并解释一下原因。')
    expect(result).toEqual({ kind: 'none' })
  })

  it('generates a legal RESEARCH full runner request', () => {
    const result = detectTaskEngineIntercept('mode=RESEARCH\naction=full\n请运行 task_engine_runner，主题：B2B SaaS GTM 决策。')
    expect(result.kind).toBe('valid')
    if (result.kind !== 'valid') return
    expect(result.request).toMatchObject({
      mode: 'RESEARCH',
      action: 'full',
      execution_intent: 'production_full',
    })
    expect(result.request).not.toHaveProperty('research_packet_path')
  })

  it('returns a clear error when DECISION full is missing research_packet_path', () => {
    const result = detectTaskEngineIntercept('mode=DECISION\naction=full\n请运行 task_engine_runner。query 是：稳定性复跑。')
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') return
    expect(result.error).toContain('research_packet_path is required')
  })

  it('returns a clear error when natural language DECISION full is missing query', () => {
    const result = detectTaskEngineIntercept(`请启动 Research/Decision 的 DECISION full，研究包路径是 ${STAGE_A_PACKET}。`)
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') return
    expect(result.error).toContain('query is required')
  })

  it('requires research_packet_path to be a local absolute path', () => {
    const result = detectTaskEngineIntercept('用 task_engine_runner 跑 DECISION full。query 是：稳定性复跑。research_packet_path 是：relative/research_evidence_packet.md。')
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') return
    expect(result.error).toContain('local absolute path')
  })

  it('does not intercept audit of an existing run_dir', () => {
    const result = detectTaskEngineIntercept(`请只读审计这个已经存在的运行目录：${DECISION_RUN_DIR}`)
    expect(result).toEqual({ kind: 'none' })
  })

  it('does not intercept prompts that forbid starting new tasks', () => {
    const result = detectTaskEngineIntercept(`不要启动任何新任务，不要运行任何管线，请检查 ${FINAL_REPORT}`)
    expect(result).toEqual({ kind: 'none' })
  })

  it('does not intercept task_engine_runner diagnostics', () => {
    const result = detectTaskEngineIntercept('检查 task_engine_runner 为什么返回 blocked')
    expect(result).toEqual({ kind: 'none' })
  })

  it('does not intercept research_packet_path correctness questions', () => {
    const result = detectTaskEngineIntercept(`这个 research_packet_path 是不是正确？${STAGE_A_PACKET}`)
    expect(result).toEqual({ kind: 'none' })
  })

  it('does not treat a decision_full run directory as a research packet', () => {
    const result = detectTaskEngineIntercept(`用 task_engine_runner 跑 DECISION full。query 是：稳定性复跑。research_packet_path 是：${DECISION_RUN_DIR}。`)
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') return
    expect(result.error).toContain('research_evidence_packet.md')
  })

  it('does not treat final_decision_report.md as a research packet', () => {
    const result = detectTaskEngineIntercept(`用 task_engine_runner 跑 DECISION full。query 是：稳定性复跑。research_packet_path 是：${FINAL_REPORT}。`)
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') return
    expect(result.error).toContain('research_evidence_packet.md')
  })

  it('does not intercept negated DECISION full audit prompts', () => {
    const result = detectTaskEngineIntercept(`不要启动 DECISION full，只审计已有 run_dir：${DECISION_RUN_DIR}`)
    expect(result).toEqual({ kind: 'none' })
  })

  it('does not intercept weak decision discussion', () => {
    const result = detectTaskEngineIntercept('这个 decision 怎么办？我们先讨论一下利弊。')
    expect(result).toEqual({ kind: 'none' })
  })

  it('rejects smoke actions instead of restoring legacy task-engine paths', () => {
    const result = detectTaskEngineIntercept('mode=DECISION\naction=smoke-decision-final\n请运行 task_engine_runner。')
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') return
    expect(result.error).toContain('does not allow smoke')
  })

  it('does not add a WebUI shell or inline task_engine_runner Python import bypass', () => {
    const source = readFileSync('packages/server/src/services/hermes/run-chat/task-engine-intercept.ts', 'utf8')
    const indexSource = readFileSync('packages/server/src/services/hermes/run-chat/index.ts', 'utf8')
    const bridgeSource = readFileSync('packages/server/src/services/hermes/agent-bridge/python/bridge_server.py', 'utf8')
    expect(source).not.toContain('node:child_process')
    expect(source).not.toContain('spawn(')
    expect(source).not.toContain('python -c')
    expect(source).not.toContain('from tools.task_engine_runner import task_engine_runner')
    expect(indexSource).not.toContain('node:child_process')
    expect(indexSource).not.toContain('python -c')
    expect(indexSource.indexOf('detectTaskEngineIntercept')).toBeGreaterThanOrEqual(0)
    expect(indexSource.indexOf('detectTaskEngineIntercept')).toBeLessThan(indexSource.indexOf('ensureBridgeReadyForChatRun'))
    expect(bridgeSource).not.toContain('subprocess')
    expect(bridgeSource).not.toContain('os.system')
    expect(bridgeSource).not.toContain('from tools.task_engine_runner import task_engine_runner')
    expect(bridgeSource).toContain('registry.dispatch("task_engine_runner", args)')
  })

  it('does not reintroduce legacy engine, ROUTE_CARD, or smoke dispatch', () => {
    const source = readFileSync('packages/server/src/services/hermes/run-chat/task-engine-intercept.ts', 'utf8')
    const indexSource = readFileSync('packages/server/src/services/hermes/run-chat/index.ts', 'utf8')
    expect(source).not.toContain('ROUTE_CARD')
    expect(indexSource).not.toContain('ROUTE_CARD')
    expect(source).not.toContain('legacy engine')
    expect(indexSource).not.toContain('legacy engine')
    expect(source).not.toContain('smoke-decision-final')
    expect(source).not.toContain('smoke-research')
  })
})

describe('task engine bridge dispatch', () => {
  it('sends a structured registered-runner request through Agent Bridge', async () => {
    const client = new AgentBridgeClient({ endpoint: 'ipc:///tmp/test.sock' })
    const request = vi.fn().mockResolvedValue({ ok: true, tool: 'task_engine_runner', result: '{"status":"ok"}' })
    ;(client as any).request = request

    await client.taskEngineRunner({
      query: 'mode=RESEARCH\naction=full\n请走 task_engine_runner。',
      mode: 'RESEARCH',
      action: 'full',
      execution_intent: 'production_full',
    }, 'default', { timeoutMs: 123 })

    expect(request).toHaveBeenCalledWith({
      action: 'task_engine_runner_dispatch',
      args: {
        query: 'mode=RESEARCH\naction=full\n请走 task_engine_runner。',
        mode: 'RESEARCH',
        action: 'full',
        execution_intent: 'production_full',
      },
      timeout: 1,
      profile: 'default',
    }, { timeoutMs: 123 })
    const call = request.mock.calls[0]?.[0]
    expect(call.action).toBe('task_engine_runner_dispatch')
    expect(call.args.action).toBe('full')
    expect(call.args.action).not.toBe('task_engine_runner_dispatch')
  })
})
