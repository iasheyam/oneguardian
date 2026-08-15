// Renders a status pill for any unit status. Accepts the color string from
// UNIT_STATUS (hex or CSS var) and derives alpha variants via color-mix.
export default function StatusChip({ color, label, size = 'md', className = '' }) {
  const cls = ['adm-chip', size === 'sm' ? 'adm-chip--sm' : '', className].filter(Boolean).join(' ')
  return (
    <span
      className={cls}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 9%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 27%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}
