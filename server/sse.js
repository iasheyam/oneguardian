const operatorClients = new Set()
const clientsByAccount = new Map() // accountId → Set<res>

export function addSseClient(res)    { operatorClients.add(res) }
export function removeSseClient(res) { operatorClients.delete(res) }

export function addClientSseClient(res, accountId) {
  if (!clientsByAccount.has(accountId)) clientsByAccount.set(accountId, new Set())
  clientsByAccount.get(accountId).add(res)
}
export function removeClientSseClient(res, accountId) {
  const set = clientsByAccount.get(accountId)
  if (!set) return
  set.delete(res)
  if (set.size === 0) clientsByAccount.delete(accountId)
}

export function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const res of operatorClients) {
    try { res.write(msg) } catch {}
  }
}

export function broadcastToAccount(accountId, data) {
  const clients = clientsByAccount.get(accountId)
  if (!clients?.size) return
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(msg) } catch {}
  }
}
