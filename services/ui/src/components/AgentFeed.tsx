import { useContext, useRef, useEffect } from 'react'
import { AgentStreamContext } from '../App'
import { AgentEvent, EventType } from '../lib/eventBus'

const TYPE_COLOR: Record<string, string> = {
  agent_start:     'var(--color-event-run)',
  tool_call:       'var(--color-event-spec)',
  tool_result:     'var(--color-event-file)',
  approval_needed: 'var(--color-event-approval)',
  file_write:      'var(--color-event-file)',
  task_complete:   'var(--color-event-done)',
  token_usage:     'var(--color-event-db)',
  error:           'var(--color-event-error)',
}

const TYPE_ABBR: Record<string, string> = {
  agent_start:     'AS',
  tool_call:       'TC',
  tool_result:     'TR',
  approval_needed: 'AP',
  file_write:      'FW',
  task_complete:   'DN',
  token_usage:     'TK',
  error:           'ER',
}

function statusBg(status: string) {
  if (status === 'running') return { bg: 'var(--color-status-running-bg)', fg: 'var(--color-status-running)' }
  if (status === 'waiting') return { bg: 'var(--color-status-waiting-bg)', fg: 'var(--color-status-waiting)' }
  return { bg: 'var(--color-status-done-bg)', fg: 'var(--color-status-done)' }
}

function eventDescription(e: AgentEvent): string {
  const d = e.data
  if (e.type === 'file_write') return `Wrote ${(d.path ?? d.filePath ?? 'file') as string}`
  if (e.type === 'approval_needed') return `Approval needed: ${(d.action ?? 'action') as string} on ${(d.path ?? '') as string}`
  if (e.type === 'task_complete') return `Completed: ${(d.task ?? e.agent) as string}`
  if (e.type === 'token_usage') return `${(d.model ?? 'LLM') as string} — ${((d.tokens_in as number) ?? 0) + ((d.tokens_out as number) ?? 0)} tokens`
  if (e.type === 'error') return `Error: ${(d.reason ?? d.message ?? 'unknown') as string}`
  return e.type.replace(/_/g, ' ')
}

export default function AgentFeed() {
  const { events, pendingApprovals } = useContext(AgentStreamContext)
  const streamRef = useRef<HTMLDivElement>(null)

  // Derive agent roster
  const agentMap = new Map<string, { status: string; tokens: number }>()
  for (const e of events) {
    if (e.type === 'agent_start') agentMap.set(e.agent, { status: 'running', tokens: 0 })
    if (e.type === 'task_complete') {
      const a = agentMap.get(e.agent)
      if (a) a.status = 'done'
    }
    if (e.type === 'token_usage') {
      const a = agentMap.get(e.agent)
      if (a) a.tokens += ((e.data.tokens_in as number) ?? 0) + ((e.data.tokens_out as number) ?? 0)
    }
  }

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' })
  }, [events])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Pane header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent activity</span>
        {pendingApprovals.length > 0 && (
          <span style={{ background: 'var(--color-status-amber-bg)', color: 'var(--color-status-amber)', fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10 }}>
            {pendingApprovals.length} pending
          </span>
        )}
      </div>

      {/* Roster card */}
      {agentMap.size > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', background: 'var(--color-background-surface)', flexShrink: 0 }}>
          {[...agentMap.entries()].map(([name, info]) => {
            const { bg, fg } = statusBg(info.status)
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 70, fontSize: 11, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ background: bg, color: fg, fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 8, flexShrink: 0 }}>{info.status}</span>
                <div style={{ flex: 1, height: 3, background: 'var(--color-background-tertiary)', borderRadius: 2 }}>
                  <div style={{ width: info.status === 'done' ? '100%' : info.status === 'running' ? '60%' : '30%', height: '100%', background: fg, borderRadius: 2 }} />
                </div>
                <span style={{ width: 40, fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>
                  {info.tokens > 999 ? `${(info.tokens / 1000).toFixed(1)}k` : info.tokens}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Event stream */}
      <div ref={streamRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Sticky approval events */}
        {pendingApprovals.map((e) => (
          <EventCard key={e.id ?? e.ts} event={e} sticky />
        ))}
        {/* Regular events */}
        {events.filter((e) => e.type !== 'approval_needed').slice(-200).map((e, i) => (
          <EventCard key={`${e.ts}-${i}`} event={e} />
        ))}
        {events.length === 0 && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 12px' }}>
            Waiting for agent events…
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, sticky }: { event: AgentEvent; sticky?: boolean }) {
  const color = TYPE_COLOR[event.type] ?? 'var(--color-text-muted)'
  const abbr = TYPE_ABBR[event.type] ?? event.type.slice(0, 2).toUpperCase()
  const ts = new Date(event.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 12px',
      background: sticky ? 'var(--color-status-amber-bg)' : 'transparent',
      borderLeft: sticky ? '3px solid var(--color-status-amber)' : '3px solid transparent',
      marginBottom: sticky ? 2 : 0,
    }}>
      <div style={{ width: 22, height: 22, borderRadius: 4, background: color + '22', color, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
        {abbr}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--color-text-primary)', marginRight: 4 }}>{event.agent}</span>
          {eventDescription(event)}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>{ts}</span>
    </div>
  )
}
