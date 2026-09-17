import { useState, useRef, useCallback, useEffect } from 'react'
import { useReadContract, useWriteContract, useAccount, useSignMessage } from 'wagmi'
import { readContract, waitForTransactionReceipt } from 'wagmi/actions'
import { parseUnits, formatUnits, keccak256, toHex } from 'viem'
import { TASK_VAULT_ABI, ERC20_ABI } from './abi'
import { config } from './wagmi-config'
import { VAULT_ADDRESS, USDG_ADDRESS } from './config'

const USDG_DECIMALS = 6
export const AUTH_TOKEN_KEY = 'taskvault_token'

function readStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useUserInfo(address) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getUserInfo',
    args: [address],
    query: { enabled: !!address && !!VAULT_ADDRESS },
  })
}

export function useBadge(address, modality) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getBadge',
    args: [address, modality],
    query: { enabled: !!address && !!modality && !!VAULT_ADDRESS },
  })
}

export function useAllBadges(address) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getAllBadges',
    args: [address],
    query: { enabled: !!address && !!VAULT_ADDRESS },
  })
}

export function useRegisteredModalities() {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getRegisteredModalities',
    query: { enabled: !!VAULT_ADDRESS },
  })
}

export function useTierInfo(index) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'tiers',
    args: [index],
    query: { enabled: index !== undefined && index !== null && !!VAULT_ADDRESS },
  })
}

export function useTierCount() {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getTierCount',
    query: { enabled: !!VAULT_ADDRESS },
  })
}

export function useLeaderboard(count = 10) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getLeaderboard',
    args: [count],
    query: { enabled: !!VAULT_ADDRESS },
  })
}

export function useUSDGBalance(address) {
  return useReadContract({
    address: USDG_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address && !!USDG_ADDRESS },
  })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function parseUsdgAmount(amount) {
  let parsed
  try {
    parsed = parseUnits(String(amount ?? '').trim(), USDG_DECIMALS)
  } catch {
    throw new Error('Enter a valid USDG amount')
  }
  if (parsed <= 0n) throw new Error('Enter an amount greater than 0')
  return parsed
}

function assertVaultConfigured() {
  if (!VAULT_ADDRESS) {
    throw new Error('Contracts are not configured. Set VITE_VAULT_ADDRESS in frontend/.env.')
  }
}

async function awaitReceipt(hash, label) {
  const receipt = await waitForTransactionReceipt(config, { hash })
  if (receipt?.status === 'reverted') {
    throw new Error(`${label} transaction reverted on-chain`)
  }
  return receipt
}

export function useRegister() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const register = (referrer = '0x0000000000000000000000000000000000000000') => {
    if (!VAULT_ADDRESS) return
    writeContract({ address: VAULT_ADDRESS, abi: TASK_VAULT_ABI, functionName: 'register', args: [referrer] })
  }
  return { register, hash, isPending, error, reset }
}

/**
 * Deposit USDG into the vault.
 *
 * The vault pulls funds with `usdg.transferFrom`, so a bare `depositToVault`
 * always reverts without an ERC20 allowance. This hook reads the live
 * allowance, sends `approve(VAULT_ADDRESS, amount)` and waits for that receipt
 * before submitting the deposit. `status` is 'approving' | 'depositing' |
 * 'success' | 'error' | 'idle' so the UI can surface pending states.
 */
export function useVaultDeposit() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDG_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && VAULT_ADDRESS ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: !!address && !!VAULT_ADDRESS && !!USDG_ADDRESS },
  })

  const [hash, setHash] = useState()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle')

  const deposit = useCallback(async (amount) => {
    setError(null)
    try {
      assertVaultConfigured()
      if (!USDG_ADDRESS) throw new Error('USDG is not configured. Set VITE_USDG_ADDRESS in frontend/.env.')
      if (!address) throw new Error('Connect your wallet first')
      const parsed = parseUsdgAmount(amount)

      setIsPending(true)

      // Always read a fresh allowance: the cached value may be stale.
      let current = allowance
      try {
        current = await readContract(config, {
          address: USDG_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, VAULT_ADDRESS],
        })
      } catch {
        // Fall back to the cached allowance if the read fails.
      }

      if (current === undefined || current < parsed) {
        setStatus('approving')
        const approveHash = await writeContractAsync({
          address: USDG_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [VAULT_ADDRESS, parsed],
        })
        setHash(approveHash)
        await awaitReceipt(approveHash, 'Approval')
        await refetchAllowance?.()
      }

      setStatus('depositing')
      const depositHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: TASK_VAULT_ABI,
        functionName: 'depositToVault',
        args: [parsed],
      })
      setHash(depositHash)
      await awaitReceipt(depositHash, 'Deposit')
      await refetchAllowance?.()
      setStatus('success')
      return depositHash
    } catch (err) {
      setError(err)
      setStatus('error')
      throw err
    } finally {
      setIsPending(false)
    }
  }, [address, allowance, refetchAllowance, writeContractAsync])

  return { deposit, hash, isPending, error, status, allowance }
}

export function useVaultWithdraw() {
  const { writeContractAsync } = useWriteContract()
  const [hash, setHash] = useState()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)

  const withdraw = useCallback(async (amount) => {
    setError(null)
    try {
      assertVaultConfigured()
      const parsed = parseUsdgAmount(amount)
      setIsPending(true)
      const withdrawHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: TASK_VAULT_ABI,
        functionName: 'withdrawFromVault',
        args: [parsed],
      })
      setHash(withdrawHash)
      await awaitReceipt(withdrawHash, 'Withdrawal')
      return withdrawHash
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setIsPending(false)
    }
  }, [writeContractAsync])

  return { withdraw, hash, isPending, error }
}

export function useCreateStream() {
  const { writeContractAsync } = useWriteContract()
  const [hash, setHash] = useState()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)

  const createStream = useCallback(async (amount, durationSeconds) => {
    setError(null)
    try {
      assertVaultConfigured()
      const parsed = parseUsdgAmount(amount)
      const duration = Number(durationSeconds)
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Choose a valid stream duration')
      setIsPending(true)
      const streamHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: TASK_VAULT_ABI,
        functionName: 'createStream',
        args: [parsed, BigInt(Math.floor(duration))],
      })
      setHash(streamHash)
      await awaitReceipt(streamHash, 'Stream creation')
      return streamHash
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setIsPending(false)
    }
  }, [writeContractAsync])

  return { createStream, hash, isPending, error }
}

// ---------------------------------------------------------------------------
// Auth (SIWE-style nonce + signature -> JWT)
// ---------------------------------------------------------------------------

async function readError(res, fallback) {
  const body = await res.json().catch(() => ({}))
  return new Error(body?.error || fallback)
}

/**
 * Wallet login. Fetches a nonce, asks the wallet to sign the returned message,
 * exchanges the signature for a JWT and stores it in localStorage (the token
 * TaskInterface sends as a Bearer header).
 *
 * Auto-runs once per connected address; if it failed the caller can retry with
 * `authenticate()` — there is no retry loop.
 */
export function useAuth() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [token, setToken] = useState(readStoredToken)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState(null)
  const attemptedFor = useRef(null)
  const inFlight = useRef(false)

  const authenticate = useCallback(async () => {
    if (!address) throw new Error('Connect your wallet to sign in')
    if (inFlight.current) return null
    inFlight.current = true
    setIsAuthenticating(true)
    setAuthError(null)
    try {
      const nonceRes = await fetch('/api/users/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      })
      if (!nonceRes.ok) throw await readError(nonceRes, `Login failed (${nonceRes.status})`)
      const { message } = await nonceRes.json()
      if (!message) throw new Error('Server did not return a login message')

      const signature = await signMessageAsync({ message })

      const authRes = await fetch('/api/users/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, signature, message }),
      })
      if (!authRes.ok) throw await readError(authRes, `Authentication failed (${authRes.status})`)
      const data = await authRes.json()
      if (!data?.token) throw new Error('Server did not return a session token')

      localStorage.setItem(AUTH_TOKEN_KEY, data.token)
      setToken(data.token)
      attemptedFor.current = address.toLowerCase()
      return data.token
    } catch (err) {
      setToken(null)
      try { localStorage.removeItem(AUTH_TOKEN_KEY) } catch { /* storage unavailable */ }
      setAuthError(err)
      throw err
    } finally {
      inFlight.current = false
      setIsAuthenticating(false)
    }
  }, [address, signMessageAsync])

  // Automatic login: once per connected address, and never in a loop.
  useEffect(() => {
    if (!isConnected || !address) {
      attemptedFor.current = null
      return
    }
    const key = address.toLowerCase()
    if (attemptedFor.current === key) return
    attemptedFor.current = key

    const stored = readStoredToken()
    if (stored) {
      setToken(stored)
      return
    }
    authenticate().catch(() => {
      // Surfaced through authError; TaskInterface retries via authenticate() on 401.
    })
  }, [address, isConnected, authenticate])

  return {
    isAuthenticated: !!token,
    token,
    authenticate,
    authError,
    isAuthenticating,
  }
}

// ---------------------------------------------------------------------------
// Backend task data
// ---------------------------------------------------------------------------

/**
 * Fetch active tasks from `GET /api/tasks?limit=50&walletAddress=<addr>`.
 * Returns real loading / empty / error state; never throws during render.
 */
export function useTasks(walletAddress, limit = 50) {
  const [tasks, setTasks] = useState([])
  const [pagination, setPagination] = useState(null)
  const [isLoading, setIsLoading] = useState(!!walletAddress)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!walletAddress) {
      setTasks([])
      setPagination(null)
      setError(null)
      setIsLoading(false)
      return undefined
    }

    const controller = new AbortController()
    let cancelled = false

    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({ limit: String(limit), walletAddress })
    fetch(`/api/tasks?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw await readError(res, `Failed to load tasks (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setTasks(Array.isArray(data?.tasks) ? data.tasks : [])
        setPagination(data?.pagination || null)
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        setTasks([])
        setError(err)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [walletAddress, limit, reloadKey])

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  return { tasks, pagination, isLoading, error, refetch }
}

/**
 * Fetch a single task detail (includes `taskData`, which the list endpoint
 * strips). Returns null instead of throwing so callers can fall back to the
 * list payload.
 */
export async function fetchTaskDetail(taskId, token) {
  if (!taskId) return null
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return data?.task || null
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function getReferralLink(address) {
  if (!address) return ''
  return `${window.location.origin}/?ref=${address}`
}

export function captureReferrer() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (ref) { localStorage.setItem('taskvault_referrer', ref); return ref }
  return localStorage.getItem('taskvault_referrer')
}

export function formatPoints(value) {
  if (!value) return '0'
  return Number(formatUnits(value, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatUSDG(value) {
  if (!value) return '0'
  return Number(formatUnits(value, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// The contract keys modalities by keccak256(name), so build the label map from
// the same hashes instead of the old ASCII-padded bytes32 values.
const MODALITY_LABELS = {
  [keccak256(toHex('robotics'))]: 'Robotics',
  [keccak256(toHex('llm'))]: 'LLM Evaluation',
  [keccak256(toHex('vision'))]: 'Computer Vision',
  [keccak256(toHex('audio'))]: 'Audio Processing',
  [keccak256(toHex('writing'))]: 'Writing & Research',
  [keccak256(toHex('safety'))]: 'Safety & Redteam',
  [keccak256(toHex('medical'))]: 'Medical Imaging',
}

export function formatModality(hash) {
  if (!hash || typeof hash !== 'string') return 'Unknown'
  return MODALITY_LABELS[hash.toLowerCase()] || `${hash.slice(0, 10)}...`
}

export function badgeLevelName(level) {
  return ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'][level] || 'Unknown'
}

export function badgeLevelColor(level) {
  return ['var(--tv-text-dim)', '#cd7f32', '#c0c0c0', '#ffd700', '#e5e4e2'][level] || 'var(--tv-text-muted)'
}

// ---------------------------------------------------------------------------
// Behavioural metrics tracker
// ---------------------------------------------------------------------------

export function useTaskMetrics() {
  const metrics = useRef({
    startTime: null,
    endTime: null,
    mouseEvents: 0,
    keyEvents: 0,
    pasteEvents: 0,
    tabSwitches: 0,
    scrollEvents: 0,
    clickEvents: 0,
    idleMs: 0,
    lastActive: null,
  })

  const listeners = useRef([])

  const track = useCallback(() => {
    const m = metrics.current
    m.lastActive = Date.now()
  }, [])

  const startTracking = useCallback(() => {
    const m = metrics.current
    m.startTime = Date.now()
    m.lastActive = Date.now()
    m.endTime = null
    m.mouseEvents = 0
    m.keyEvents = 0
    m.pasteEvents = 0
    m.tabSwitches = 0
    m.scrollEvents = 0
    m.clickEvents = 0
    m.idleMs = 0

    const handlers = {
      mousemove: () => { metrics.current.mouseEvents++; track() },
      mousedown: () => { metrics.current.clickEvents++; track() },
      keydown: () => { metrics.current.keyEvents++; track() },
      scroll: () => { metrics.current.scrollEvents++; track() },
      paste: () => { metrics.current.pasteEvents++; track() },
      visibilitychange: () => {
        if (document.hidden) {
          metrics.current.tabSwitches++
        }
      },
    }

    Object.entries(handlers).forEach(([event, fn]) => {
      window.addEventListener(event, fn, { passive: true })
      listeners.current.push({ event, fn })
    })

    // Idle timer
    const idleInterval = setInterval(() => {
      const now = Date.now()
      if (now - metrics.current.lastActive > 5000) {
        metrics.current.idleMs += 1000
      }
    }, 1000)
    listeners.current.push({ clear: () => clearInterval(idleInterval) })
  }, [track])

  const stopTracking = useCallback(() => {
    metrics.current.endTime = Date.now()
    listeners.current.forEach(l => {
      if (l.event) window.removeEventListener(l.event, l.fn)
      if (l.clear) l.clear()
    })
    listeners.current = []
  }, [])

  const getMetrics = useCallback(() => {
    const m = metrics.current
    return {
      timeSpentMs: m.endTime ? m.endTime - m.startTime : Date.now() - m.startTime,
      mouseEvents: m.mouseEvents,
      keyEvents: m.keyEvents,
      pasteEvents: m.pasteEvents,
      tabSwitches: m.tabSwitches,
      scrollEvents: m.scrollEvents,
      clickEvents: m.clickEvents,
      idleMs: m.idleMs,
      activeMs: (m.endTime || Date.now()) - m.startTime - m.idleMs,
    }
  }, [])

  return { startTracking, stopTracking, getMetrics }
}
