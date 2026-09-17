// Centralised, validated runtime configuration.
//
// Vite injects `import.meta.env` at build time. The bundled .env ships with
// placeholder addresses ("0x..."), and passing those to viem/wagmi throws an
// invalid-address error at runtime. Validate once here and export `undefined`
// for anything unusable so every hook can simply disable its query.

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

export function isValidAddress(value) {
  return typeof value === 'string' && ADDRESS_RE.test(value.trim())
}

const rawVault = import.meta.env.VITE_VAULT_ADDRESS
const rawUsdg = import.meta.env.VITE_USDG_ADDRESS

export const VAULT_ADDRESS = isValidAddress(rawVault) ? rawVault.trim() : undefined
export const USDG_ADDRESS = isValidAddress(rawUsdg) ? rawUsdg.trim() : undefined

const missing = []
if (!VAULT_ADDRESS) missing.push('VITE_VAULT_ADDRESS')
if (!USDG_ADDRESS) missing.push('VITE_USDG_ADDRESS')

// Human-readable configuration problem, or null when everything is usable.
export const CONFIG_ERROR = missing.length
  ? `Missing or invalid contract configuration: ${missing.join(', ')}. Set a deployed 0x address for each variable in frontend/.env and rebuild.`
  : null

export const isConfigured = CONFIG_ERROR === null
