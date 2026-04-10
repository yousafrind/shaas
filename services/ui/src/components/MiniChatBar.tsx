import { useContext, useState } from 'react'
import { AgentStreamContext } from '../App'

export default function MiniChatBar() {
  const { sendCommand } = useContext(AgentStreamContext)
  const [input, setInput] = useState('')

  function submit() {
    const cmd = input.trim()
    if (!cmd) return
    sendCommand(cmd)
    setInput('')
  }

  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border-primary)', display: 'flex', gap: 6, flexShrink: 0 }}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="Send to orchestrator…"
        style={{
          flex: 1, height: 30, padding: '0 10px',
          background: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)',
          outline: 'none',
        }}
      />
      <button onClick={submit} style={{
        padding: '0 12px', height: 30,
        background: 'var(--color-background-surface)', color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)',
      }}>
        ↑
      </button>
    </div>
  )
}
