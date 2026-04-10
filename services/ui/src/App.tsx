/*
 * ALL COLORS MUST USE CSS VARS. No #hex, no rgb(), no hsl() outside this file.
 * Define new colors here as CSS custom properties, then reference them everywhere else.
 */

import React, { createContext, useEffect, useState } from 'react'
import { useAgentStream } from './hooks/useAgentStream'
import { AgentEvent, ConnectionStatus } from './lib/eventBus'
import { sendCommand } from './lib/api'
import ChatDocTab from './tabs/ChatDocTab'
import AgentCodeTab from './tabs/AgentCodeTab'

// ── CSS Design System ──────────────────────────────────────────────
const CSS_VARS = `
  :root {
    --color-background-primary:    #0d0d0d;
    --color-background-secondary:  #141414;
    --color-background-tertiary:   #1a1a1a;
    --color-background-surface:    #222222;
    --color-background-code:       #111111;
    --color-text-primary:          #e8e8e8;
    --color-text-secondary:        #888888;
    --color-text-muted:            #555555;
    --color-border-primary:        #2a2a2a;
    --color-border-tertiary:       #222222;
    --color-accent-purple:         #7c5cbf;
    --color-accent-purple-bg:      #2d1f4a;
    --color-status-running:        #22c55e;
    --color-status-running-bg:     #052e16;
    --color-status-waiting:        #f59e0b;
    --color-status-waiting-bg:     #2d1f00;
    --color-status-done:           #14b8a6;
    --color-status-done-bg:        #042f2e;
    --color-status-amber:          #f59e0b;
    --color-status-amber-bg:       #2d1f00;
    --color-event-spec:            #7c5cbf;
    --color-event-file:            #3b82f6;
    --color-event-run:             #22c55e;
    --color-event-done:            #14b8a6;
    --color-event-approval:        #f59e0b;
    --color-event-db:              #3b82f6;
    --color-event-error:           #ef4444;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --radius-sm: 4px;
    --radius-md: 6px;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    height: 100%;
    background: var(--color-background-primary);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }
  button { cursor: pointer; font-family: inherit; font-size: 12px; }
  input, textarea { font-family: inherit; font-size: 13px; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--color-background-secondary); }
  ::-webkit-scrollbar-thumb { background: var(--color-border-primary); border-radius: 3px; }
`

// ── Shared Context ─────────────────────────────────────────────────
interface AgentStreamContextValue {
  events: AgentEvent[]
  connectionStatus: ConnectionStatus
  sendCommand: (cmd: string) => void
  pendingApprovals: AgentEvent[]
  setPendingApprovals: React.Dispatch<React.SetStateAction<AgentEvent[]>>
}

export const AgentStreamContext = createContext<AgentStreamContextValue>({
  events: [],
  connectionStatus: 'connecting',
  sendCommand: () => {},
  pendingApprovals: [],
  setPendingApprovals: () => {},
})

// ── Token counter ──────────────────────────────────────────────────
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function App() {
  const { events, connectionStatus, sendCommand: _send } = useAgentStream()
  const [pendingApprovals, setPendingApprovals] = useState<AgentEvent[]>([])
  const [activeTab, setActiveTab] = useState<0 | 1>(0)
  const [unreadCount, setUnreadCount] = useState(0)

  // Inject CSS vars once
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = CSS_VARS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  // Collect sticky approval_needed events
  useEffect(() => {
    const latest = events[events.length - 1]
    if (latest?.type === 'approval_needed' && latest.id) {
      setPendingApprovals((prev) => {
        if (prev.find((e) => e.id === latest.id)) return prev
        return [...prev, latest]
      })
    }
  }, [events])

  // Badge on Tab 2 when not active
  useEffect(() => {
    if (activeTab === 1) { setUnreadCount(0); return }
    const latest = events[events.length - 1]
    if (latest) setUnreadCount((n) => n + 1)
  }, [events])

  // Derive agent count and token total from events
  const runningAgents = new Set(
    events.filter((e) => e.type === 'agent_start').map((e) => e.agent)
  )
  events.filter((e) => e.type === 'task_complete').forEach((e) => runningAgents.delete(e.agent))
  const agentCount = runningAgents.size

  const tokenTotal = events
    .filter((e) => e.type === 'token_usage')
    .reduce((sum, e) => {
      const d = e.data as { tokens_in?: number; tokens_out?: number }
      return sum + (d.tokens_in ?? 0) + (d.tokens_out ?? 0)
    }, 0)

  const ctx: AgentStreamContextValue = {
    events,
    connectionStatus,
    sendCommand: _send,
    pendingApprovals,
    setPendingApprovals,
  }

  const statusDot: React.CSSProperties = {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    marginRight: 5,
    background:
      connectionStatus === 'connected'
        ? 'var(--color-status-running)'
        : connectionStatus === 'connecting'
        ? 'var(--color-status-waiting)'
        : 'var(--color-event-error)',
  }

  return (
    <AgentStreamContext.Provider value={ctx}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-background-tertiary)' }}>

        {/* Title bar */}
        <div style={{
          display: 'flex', alignItems: 'center', height: 40,
          background: 'var(--color-background-primary)',
          borderBottom: '1px solid var(--color-border-primary)',
          padding: '0 12px', flexShrink: 0,
        }}>
          {/* Traffic lights (decorative) */}
          <div style={{ display: 'flex', gap: 6, marginRight: 16 }}>
            {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
            ))}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {(['Chat + docs', 'Agent activity + code'] as const).map((label, i) => (
              <button
                key={i}
                onClick={() => { setActiveTab(i as 0 | 1); if (i === 1) setUnreadCount(0) }}
                style={{
                  position: 'relative',
                  padding: '4px 12px',
                  background: activeTab === i ? 'var(--color-background-tertiary)' : 'transparent',
                  color: activeTab === i ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: activeTab === i ? 500 : 400,
                }}
              >
                {label}
                {i === 1 && unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 4,
                    background: 'var(--color-accent-purple)',
                    color: 'var(--color-text-primary)',
                    fontSize: 9, fontWeight: 700,
                    padding: '0 4px', borderRadius: 8, minWidth: 14, textAlign: 'center',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Global status bar */}
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
            <span style={statusDot} />
            {agentCount > 0 ? `${agentCount} agent${agentCount > 1 ? 's' : ''} running · ` : ''}
            {formatTokens(tokenTotal)} tokens
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {activeTab === 0 ? <ChatDocTab /> : <AgentCodeTab />}
        </div>
      </div>
    </AgentStreamContext.Provider>
  )
}
