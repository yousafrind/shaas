import { useContext } from 'react'
import { approveEvent, rejectEvent } from '../lib/api'
import { AgentStreamContext } from '../App'
import { AgentEvent } from '../lib/eventBus'

export function useApproval() {
  const { events, setPendingApprovals, pendingApprovals } = useContext(AgentStreamContext)

  // pendingApprovals is managed in App context — sticky until acted on

  async function approve(eventId: string) {
    try {
      await approveEvent(eventId)
    } catch {
      // Best-effort — remove from UI regardless
    }
    setPendingApprovals((prev: AgentEvent[]) => prev.filter((e) => e.id !== eventId))
  }

  async function reject(eventId: string) {
    try {
      await rejectEvent(eventId)
    } catch {
      // Best-effort
    }
    setPendingApprovals((prev: AgentEvent[]) => prev.filter((e) => e.id !== eventId))
  }

  return { pendingApprovals, approve, reject }
}
