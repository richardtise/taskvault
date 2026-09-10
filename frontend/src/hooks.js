import { useReadContract, useWriteContract, useAccount } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { TASK_VAULT_ABI, ERC20_ABI } from './abi'

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS
const USDG_ADDRESS = import.meta.env.VITE_USDG_ADDRESS

export function useUserInfo(address) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getUserInfo',
    args: [address],
    enabled: !!address,
  })
}

export function useBadge(address, modality) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getBadge',
    args: [address, modality],
    enabled: !!address && !!modality,
  })
}

export function useAllBadges(address) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getAllBadges',
    args: [address],
    enabled: !!address,
  })
}

export function useRegisteredModalities() {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getRegisteredModalities',
  })
}

export function useTierInfo(index) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'tiers',
    args: [index],
  })
}

export function useTierCount() {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getTierCount',
  })
}

export function useLeaderboard(count = 10) {
  return useReadContract({
    address: VAULT_ADDRESS,
    abi: TASK_VAULT_ABI,
    functionName: 'getLeaderboard',
    args: [count],
  })
}

export function useUSDGBalance(address) {
  return useReadContract({
    address: USDG_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    enabled: !!address,
  })
}

export function useRegister() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const register = (referrer = '0x0000000000000000000000000000000000000000') => {
    writeContract({ address: VAULT_ADDRESS, abi: TASK_VAULT_ABI, functionName: 'register', args: [referrer] })
  }
  return { register, hash, isPending, error }
}

export function useVaultDeposit() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const deposit = (amount) => {
    writeContract({ address: VAULT_ADDRESS, abi: TASK_VAULT_ABI, functionName: 'depositToVault', args: [parseUnits(amount.toString(), 6)] })
  }
  return { deposit, hash, isPending, error }
}

export function useVaultWithdraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const withdraw = (amount) => {
    writeContract({ address: VAULT_ADDRESS, abi: TASK_VAULT_ABI, functionName: 'withdrawFromVault', args: [parseUnits(amount.toString(), 6)] })
  }
  return { withdraw, hash, isPending, error }
}

export function useCreateStream() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const createStream = (amount, durationSeconds) => {
    writeContract({ address: VAULT_ADDRESS, abi: TASK_VAULT_ABI, functionName: 'createStream', args: [parseUnits(amount.toString(), 6), durationSeconds] })
  }
  return { createStream, hash, isPending, error }
}

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

export function formatModality(hash) {
  const map = {
    '0x726f626f74696373000000000000000000000000000000000000000000000000': 'Robotics',
    '0x6c6c6d0000000000000000000000000000000000000000000000000000000000': 'LLM Evaluation',
    '0x766973696f6e0000000000000000000000000000000000000000000000000000': 'Computer Vision',
    '0x617564696f000000000000000000000000000000000000000000000000000000': 'Audio Processing',
    '0x77726974696e6700000000000000000000000000000000000000000000000000': 'Writing & Research',
    '0x7361666574790000000000000000000000000000000000000000000000000000': 'Safety & Redteam',
    '0x6d65646963616c00000000000000000000000000000000000000000000000000': 'Medical Imaging',
  }
  return map[hash] || hash.slice(0, 10) + '...'
}

export function badgeLevelName(level) {
  return ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'][level] || 'Unknown'
}

export function badgeLevelColor(level) {
  return ['var(--tv-text-dim)', '#cd7f32', '#c0c0c0', '#ffd700', '#e5e4e2'][level] || 'var(--tv-text-muted)'
}

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
