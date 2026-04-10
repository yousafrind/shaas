import React, { useContext, useRef, useState, useEffect } from 'react'
import { AgentStreamContext } from '../App'
import { AgentEvent } from '../lib/eventBus'

const SLASH_COMMANDS = [
  { cmd: '/create-prd', desc: 'Generate a PRD from a brief' },
  { cmd: '/plan', desc: 'Generate epics and stories from PRD' },
  { cmd: '/go', desc: 'Execute current sprint autonomously' },
  { cmd: '/pause', desc: 'Pause all agent loops' },
  { cmd: '/resume', desc: 'Resume paused agents' },
  { cmd: '/status', desc: 'Show agent states and token usage' },
  { cmd: '/commit', desc: 'Git commit workspace changes' },
  { cmd: '/approve', desc: 'Approve pending tool use' },
  { cmd: '/reject', desc: 'Reject pending tool use' },
  { cmd: '/spawn', desc: 'Manually spawn a named agent' },
  { cmd: '/skill', desc: 'Manage skills (list | add)' },
]

interface Message {
  id: string
  role: 'user' | 'agent'
  agent?: string
  text: string
  ts: number
}

export default function ChatPane() {
  const { events, sendCommand } = useContext(AgentStreamContext)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Populate messages from agent events
  useEffect(() => {
    const latest = events[events.length - 1]
    if (!latest) return
    if (['tool_result', 'task_complete', 'error'].includes(latest.type)) {
      const text = (latest.data.output ?? latest.data.message ?? latest.data.reason ?? latest.type) as string
      setMessages((prev) => [...prev, {
        id: `${latest.ts}-${Math.random()}`,
        role: 'agent',
        agent: latest.agent,
        text: String(text),
        ts: latest.ts,
      }])
    }
  }, [events])

  // Auto-scroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    if (val.startsWith('/')) {
      setShowPicker(true)
      setPickerFilter(val.slice(1).toLowerCase())
    } else {
      setShowPicker(false)
    }
    // Auto-grow
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
  }

  function submit() {
    const cmd = input.trim()
    if (!cmd) return
    setMessages((prev) => [...prev, { id: String(Date.now()), role: 'user', text: cmd, ts: Date.now() / 1000 }])
    sendCommand(cmd)
    setInput('')
    setShowPicker(false)
    if (textareaRef.current) textareaRef.current.style.height = '36px'
  }

  function pickCommand(cmd: string) {
    setInput(cmd + ' ')
    setShowPicker(false)
    textareaRef.current?.focus()
  }

  const filtered = SLASH_COMMANDS.filter((c) => c.cmd.includes(pickerFilter) || c.desc.toLowerCase().includes(pickerFilter))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-background-secondary)' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chat</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {['/create-prd', '/plan'].map((cmd) => (
            <button key={cmd} onClick={() => { setInput(cmd + ' '); textareaRef.current?.focus() }}
              style={{ padding: '2px 8px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)' }}>
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            Type a message or use /create-prd to start
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'agent' && m.agent && (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 2 }}>{m.agent}</span>
            )}
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
              background: m.role === 'user' ? 'var(--color-accent-purple-bg)' : 'var(--color-background-surface)',
              color: 'var(--color-text-primary)',
              border: `1px solid ${m.role === 'user' ? 'var(--color-accent-purple)' : 'var(--color-border-primary)'}`,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div style={{ padding: 10, borderTop: '1px solid var(--color-border-primary)', position: 'relative', flexShrink: 0 }}>
        {showPicker && filtered.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 10, right: 10,
            background: 'var(--color-background-surface)', border: '1px solid var(--color-border-primary)',
            borderRadius: 'var(--radius-md)', overflow: 'hidden', zIndex: 10,
          }}>
            {filtered.map((c) => (
              <div key={c.cmd} onClick={() => pickCommand(c.cmd)}
                style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-background-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: 'var(--color-accent-purple)', fontFamily: 'var(--font-mono)', fontSize: 12, width: 120, flexShrink: 0 }}>{c.cmd}</span>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{c.desc}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Type a message or / for commands…"
            rows={1}
            style={{
              flex: 1, resize: 'none', height: 36, minHeight: 36, maxHeight: 96,
              background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)',
              padding: '8px 10px', outline: 'none',
            }}
          />
          <button onClick={submit} style={{
            width: 36, height: 36, background: 'var(--color-accent-purple)', color: 'var(--color-text-primary)',
            border: 'none', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
