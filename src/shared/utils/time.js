export function humanizeTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const diffMs   = Date.now() - d
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1)  return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24)  return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7)  return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day:   'numeric',
    ...(diffDays > 365 && { year: 'numeric' }),
  })
}
