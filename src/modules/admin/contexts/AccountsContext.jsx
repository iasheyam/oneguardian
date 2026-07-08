import { createContext, useContext, useState } from 'react'
import { mockAccounts as seed } from '../data/mockAccounts'

const Ctx = createContext(null)

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

export function AccountsProvider({ children }) {
  const [accounts, setAccounts] = useState(() => JSON.parse(JSON.stringify(seed)))

  // ── Account ──────────────────────────────────────────────────
  function createAccount(data) {
    const id = uid('acc')
    const since = new Date().toISOString().slice(0, 7)
    setAccounts(p => [...p, { id, since, units: [], groups: [], ...data }])
    return id
  }
  function updateAccount(id, data) {
    setAccounts(p => p.map(a => a.id === id ? { ...a, ...data } : a))
  }
  function deleteAccount(id) {
    setAccounts(p => p.filter(a => a.id !== id))
  }

  // ── Unit (per account) ────────────────────────────────────────
  function createUnit(accountId, data) {
    const id = uid('u')
    const unit = { id, devices: [], ...data }
    setAccounts(p => p.map(a => a.id !== accountId ? a
      : { ...a, units: [...a.units, unit] }))
    return id
  }
  function updateUnit(accountId, unitId, data) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : { ...u, ...data }),
    }))
  }
  function deleteUnit(accountId, unitId) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a,
      units: a.units.filter(u => u.id !== unitId),
      groups: a.groups.map(g => ({ ...g, unitIds: g.unitIds.filter(id => id !== unitId) })),
    }))
  }

  // ── Group ─────────────────────────────────────────────────────
  function createGroup(accountId, name) {
    const id = uid('grp')
    setAccounts(p => p.map(a => a.id !== accountId ? a
      : { ...a, groups: [...a.groups, { id, name, unitIds: [] }] }))
    return id
  }
  function renameGroup(accountId, groupId, name) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.map(g => g.id !== groupId ? g : { ...g, name }),
    }))
  }
  function deleteGroup(accountId, groupId) {
    setAccounts(p => p.map(a => a.id !== accountId ? a
      : { ...a, groups: a.groups.filter(g => g.id !== groupId) }))
  }

  // ── Device (per unit) ────────────────────────────────────────
  function createDevice(accountId, unitId, data) {
    const id = uid('dv')
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : {
        ...u, devices: [...(u.devices ?? []), { id, ...data }],
      }),
    }))
  }
  function updateDevice(accountId, unitId, deviceId, data) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : {
        ...u, devices: u.devices.map(d => d.id !== deviceId ? d : { ...d, ...data }),
      }),
    }))
  }
  function deleteDevice(accountId, unitId, deviceId) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, units: a.units.map(u => u.id !== unitId ? u : {
        ...u, devices: u.devices.filter(d => d.id !== deviceId),
      }),
    }))
  }

  // ── Group membership ──────────────────────────────────────────
  function addUnitToGroup(accountId, groupId, unitId) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.map(g => g.id !== groupId || g.unitIds.includes(unitId) ? g
        : { ...g, unitIds: [...g.unitIds, unitId] }),
    }))
  }
  function removeUnitFromGroup(accountId, groupId, unitId) {
    setAccounts(p => p.map(a => a.id !== accountId ? a : {
      ...a, groups: a.groups.map(g => g.id !== groupId ? g
        : { ...g, unitIds: g.unitIds.filter(id => id !== unitId) }),
    }))
  }

  return (
    <Ctx.Provider value={{
      accounts,
      createAccount, updateAccount, deleteAccount,
      createUnit, updateUnit, deleteUnit,
      createDevice, updateDevice, deleteDevice,
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
