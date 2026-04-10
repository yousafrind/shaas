/* ALL COLORS MUST USE CSS VARS. No #hex, no rgb(), no hsl() outside App.tsx. */

export type EventSource = 'openharness' | 'hiclaw' | 'aio'

export type EventType =
  | 'agent_start'
  | 'tool_call'
  | 'tool_result'
  | 'approval_needed'
  | 'file_write'
  | 'task_complete'
  | 'token_usage'
  | 'error'
  | string

export interface AgentEvent {
  source: EventSource
  type: EventType
  agent: string
  ts: number
  data: Record<string, unknown>
  id?: string
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface EventBusConnection {
  send: (msg: string) => void
  close: () => void
}

export function createEventBusConnection(
  onEvent: (e: AgentEvent) => void,
  onStatusChange: (s: ConnectionStatus) => void,
): EventBusConnection {
  const url = import.meta.env.VITE_EVENT_BUS_URL as string
  let ws: WebSocket | null = null
  let closed = false
  let backoff = 1000

  function connect() {
    if (closed) return
    onStatusChange('connecting')
    ws = new WebSocket(url)

    ws.onopen = () => {
      backoff = 1000
      onStatusChange('connected')
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent
        onEvent(event)
      } catch {
        // ignore non-JSON frames
      }
    }

    ws.onclose = () => {
      if (closed) return
      onStatusChange('disconnected')
      setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  return {
    send: (msg) => ws?.readyState === WebSocket.OPEN && ws.send(msg),
    close: () => {
      closed = true
      ws?.close()
    },
  }
}
