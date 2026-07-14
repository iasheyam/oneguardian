import { createContext, useContext, useState, useEffect } from 'react'
import { apiUrl, apiFetch } from '../../../shared/utils/api'

const Ctx = createContext(null)

export function AccountsProvider({ children }) {
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    apiFetch(apiUrl('/api/accounts'))
      .then(async r => {
        const data = await r.json()
        if (!r.ok) {
          console.error('[AccountsContext] GET /api/accounts failed', r.status, data)
          return []
        }
        return data
      })
      .then(data => { setAccounts(Array.isArray(data) ? data : []) })
      .catch(err => console.error('[AccountsContext] fetch error:', err))
      .finally(() => setLoading(false))
  }, [])

  function unitKind(accountId, unitId) {
    return accounts.find(a => a.id === accountId)?.units.find(u => u.id === unitId)?.type
  }

  // ── Account ──────────────────────────────────────────────────
  async function createAccount(data) {
    const res = await apiFetch(apiUrl('/api/accounts'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name, type: data.type, industry: data.industry, status: data.status,
        contactName: data.contact?.name, contactEmail: data.contact?.email, contactPhone: data.contact?.phone,
      }),
    })
    const acc = await res.json()
    setAccounts(p => [...p, acc])
    return acc.id
  }

  async function updateAccount(id, data) {
    const res = await apiFetch(apiUrl(`/api/accounts/${id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name, type: data.type, industry: data.industry, status: data.status,
        contactName: data.contact?.name, contactEmail: data.contact?.email, contactPhone: data.contact?.phone,
      }),
    })
    const acc = await res.json()
    setAccounts(p => p.map(a => a.id === id ? acc : a))
  }

  async function deleteAccount(id) {
    await apiFetch(apiUrl(`/api/accounts/${id}`), { method: 'DELETE' })
    setAccounts(p => p.filter(a => a.id !== id))
  }

  // ── Unit ─────────────────────────────────────────────────────
  async function createUnit(accountId, data) {
    const endpoint = data.type === 'person'
      ? `/api/accounts/${accountId}/principals`
      : `/api/accounts/${accountId}/vehicles`
    const res = await apiFetch(apiUrl(endpoint), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const unit = await res.json()
    setAccounts(p => p.map(a => a.id !== accountId ? a : { ...a, units: [...a.units, unit] }))
    return unit.id
  }

  async function updateUnit(accountId, unitId, data) {
    const type     = unitKind(accountId, unitId)
    const endpoint = type === 'person'
      ? `/api/accounts/${accountId}/principals/${unitId}`
      : `/api/accounts/${accountId}/vehicles/${unitId}`
    const res = await apiFetch(apiUrl(endpoint), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const unit = await res.json()
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : { ...u, ...unit }),
    }))
  }

  async function deleteUnit(accountId, unitId) {
    const type     = unitKind(accountId, unitId)
    const endpoint = type === 'person'
      ? `/api/accounts/${accountId}/principals/${unitId}`
      : `/api/accounts/${accountId}/vehicles/${unitId}`
    await apiFetch(apiUrl(endpoint), { method: 'DELETE' })
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a,
      units:  a.units.filter(u => u.id !== unitId),
      groups: a.groups.map(g => ({ ...g, unitIds: g.unitIds.filter(id => id !== unitId) })),
    }))
  }

  // ── Device ───────────────────────────────────────────────────
  async function createDevice(accountId, unitId, data) {
    const res = await apiFetch(apiUrl(`/api/accounts/${accountId}/units/${unitId}/devices`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const device = await res.json()
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : { ...u, devices: [...(u.devices ?? []), device] }),
    }))
  }

  async function updateDevice(accountId, unitId, deviceId, data) {
    const res = await apiFetch(apiUrl(`/api/accounts/${accountId}/units/${unitId}/devices/${deviceId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const device = await res.json()
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : {
        ...u, devices: (u.devices ?? []).map(d => d.id !== deviceId ? d : device),
      }),
    }))
  }

  async function setPrimaryDevice(accountId, unitId, deviceId) {
    const res = await apiFetch(apiUrl(`/api/accounts/${accountId}/units/${unitId}/primary-device`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    })
    const { primaryDeviceId } = await res.json()
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : { ...u, primaryDeviceId }),
    }))
  }

  async function deleteDevice(accountId, unitId, deviceId) {
    await apiFetch(apiUrl(`/api/accounts/${accountId}/units/${unitId}/devices/${deviceId}`), { method: 'DELETE' })
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : {
        ...u, devices: (u.devices ?? []).filter(d => d.id !== deviceId),
      }),
    }))
  }

  // ── Group ─────────────────────────────────────────────────────
  async function createGroup(accountId, name) {
    const res = await apiFetch(apiUrl(`/api/accounts/${accountId}/groups`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const group = await res.json()
    setAccounts(p => p.map(a => a.id !== accountId ? a : { ...a, groups: [...a.groups, group] }))
    return group.id
  }

  async function renameGroup(accountId, groupId, name) {
    await apiFetch(apiUrl(`/api/accounts/${accountId}/groups/${groupId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.map(g => g.id !== groupId ? g : { ...g, name }),
    }))
  }

  async function deleteGroup(accountId, groupId) {
    await apiFetch(apiUrl(`/api/accounts/${accountId}/groups/${groupId}`), { method: 'DELETE' })
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.filter(g => g.id !== groupId),
    }))
  }

  // ── Group membership ──────────────────────────────────────────
  async function addUnitToGroup(accountId, groupId, unitId) {
    const type = unitKind(accountId, unitId)
    await apiFetch(apiUrl(`/api/accounts/${accountId}/groups/${groupId}/members`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(type === 'person' ? { principalId: unitId } : { vehicleId: unitId }),
    })
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.map(g => g.id !== groupId || g.unitIds.includes(unitId) ? g
        : { ...g, unitIds: [...g.unitIds, unitId] }),
    }))
  }

  async function removeUnitFromGroup(accountId, groupId, unitId) {
    const type = unitKind(accountId, unitId)
    await apiFetch(apiUrl(`/api/accounts/${accountId}/groups/${groupId}/members`), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(type === 'person' ? { principalId: unitId } : { vehicleId: unitId }),
    })
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.map(g => g.id !== groupId ? g
        : { ...g, unitIds: g.unitIds.filter(id => id !== unitId) }),
    }))
  }

  return (
    <Ctx.Provider value={{
      accounts, loading,
      createAccount, updateAccount, deleteAccount,
      createUnit, updateUnit, deleteUnit,
      createDevice, updateDevice, deleteDevice, setPrimaryDevice,
      createGroup, renameGroup, deleteGroup,
      addUnitToGroup, removeUnitFromGroup,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAccounts() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccounts must be inside AccountsProvider')
  return ctx
}
