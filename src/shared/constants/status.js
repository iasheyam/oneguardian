// Unit operational status — used across all pages that render principals/vehicles.
// Colors match the Palette C (Slate) dark tokens defined in tokens.css.
export const UNIT_STATUS = {
  normal:  { color: '#22D3EE', label: 'SECURE'  }, // --adm-secure
  warning: { color: '#FB923C', label: 'WARNING' }, // --adm-warning
  duress:  { color: '#F43F5E', label: 'DURESS'  }, // --adm-duress
  offline: { color: '#64748B', label: 'OFFLINE' }, // --adm-offline
}
