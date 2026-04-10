import { useEffect, useRef, useState } from 'react'
import { createEventBusConnection, AgentEvent, ConnectionStatus } from '../lib/eventBus'
import { sendCommand } from '../lib/api'

const MAX_EVENTS = 500

export function useAgentStream() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const connRef = useRef<ReturnType<typeof createEventBusConnection> | null>(null)

  useEffect(() => {
    const conn = createEventBusConnection(
      (event) => {
        setEvents((prev) => {
          const next = [...prev, event]
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
        })
      },
      setConnectionStatus,
    )
    connRef.current = conn
    return () => conn.close()
  }, [])

  return {
    events,
    connectionStatus,
    sendCommand,
  }
}
