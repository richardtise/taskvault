import React, { useState, useEffect } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { 
  useUserInfo, useUSDGBalance,
  useRegister,
  useVaultDeposit, useVaultWithdraw, useCreateStream,
  useAllBadges,
  formatPoints, formatUSDG, captureReferrer, getReferralLink,
  formatModality, badgeLevelName, badgeLevelColor
} from './hooks'
import TaskInterface from './components/TaskInterface'
import { robinhoodTestnet } from './wagmi-config'

const TIERS = [
  { name: 'Scout', tasks: 0, accuracy: 0, multiplier: 1.0, color: '#00d4aa', icon: '🔭' },
  { name: 'Operator', tasks: 50, accuracy: 85, multiplier: 1.5, color: '#6366f1', icon: '⚙️' },
  { name: 'Specialist', tasks: 200, accuracy: 90, multiplier: 2.5, color: '#f59e0b', icon: '🎯' },
  { name: 'Expert', tasks: 500, accuracy: 95, multiplier: 4.0, color: '#ef4444', icon: '🔬' },
  { name: 'Architect', tasks: 'Invite', accuracy: 98, multiplier: 6.0, color: '#e0e0e0', icon: '🏛️' },
]

const TASK_CATEGORIES = [
  {
    id: 'llm-rank',
    title: 'LLM Response Ranking',
    desc: 'Compare two AI responses and pick the better one.',
    pay: '15 pts',
    difficulty: 'Easy',
    icon: '🤖',
    color: '#a78bfa',
    available: 124,
  },
  {
    id: 'robot-phase',
    title: 'Robot Video Phase Labeling',
    desc: 'Mark timestamps where robot actions begin and end.',
    pay: '80 pts',
    difficulty: 'Medium',
    icon: '🦾',
    color: '#ff9f1c',
    available: 45,
  },
  {
    id: 'grasp-annotate',
    title: 'Grasp Outcome Classification',
    desc: 'Label robot grasp attempts as success, slip, or collision.',
    pay: '60 pts',
    difficulty: 'Medium',
    icon: '✋',
    color: '#ff9f1c',
    available: 89,
  },
  {
    id: 'safety-redteam',
    title: 'Safety Red-Teaming',
    desc: 'Find prompts that make AI models produce unsafe outputs.',
    pay: '200 pts',
    difficulty: 'Hard',
    icon: '🛡️',
    color: '#ef4444',
    available: 12,
  },
  {
    id: 'human-demo',
    title: 'Human Demonstration Videos',
    desc: 'Film yourself doing household tasks (folding, tools, etc).',
    pay: '150 pts',
    difficulty: 'Easy',
    icon: '📹',
    color: '#f43f5e',
    available: 200,
  },
  {
    id: 'vision-label',
    title: 'Industrial Visual Inspection',
    desc: 'Mark defects on circuit board and weld images.',
    pay: '25 pts',
    difficulty: 'Easy',
    icon: '🔍',
    color: '#f43f5e',
    available: 340,
  },
  {
    id: 'writing-eval',
    title: 'Writing Quality Evaluation',
    desc: 'Rate and improve technical writing samples.',
    pay: '35 pts',
    difficulty: 'Easy',
    icon: '✍️',
    color: '#1c1917',
    available: 156,
  },
  {
    id: 'audio-transcribe',
    title: 'Audio Transcription Review',
    desc: 'Verify and correct AI-generated transcripts.',
    pay: '20 pts',
    difficulty: 'Easy',
    icon: '🎧',
    color: '#4ade80',
    available: 278,
  },
]

const STREAM_PERIODS = [
  { label: '3 Months', months: 3, apr: '8%', multiplier: '1.1x' },
  { label: '6 Months', months: 6, apr: '12%', multiplier: '1.25x' },
  { label: '9 Months', months: 9, apr: '16%', multiplier: '1.5x' },
  { label: '12 Months', months: 12, apr: '24%', multiplier: '2.0x' },
]

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton shimmer" style={{ width: 40, height: 40, borderRadius: 10 }} />
      <div className="skeleton shimmer" style={{ width: '70%', height: 18, borderRadius: 4, marginTop: 16 }} />
      <div className="skeleton shimmer" style={{ width: '100%', height: 14, borderRadius: 4, marginTop: 10 }} />
      <div className="skeleton shimmer" style={{ width: '40%', height: 14, borderRadius: 4, marginTop: 10 }} />
    </div>
  )
}

export default function TaskVaultDashboard() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const { data: userInfo, isLoading: userLoading, isError: userError } = useUserInfo(address)
  const { data: usdcBalance } = useUSDGBalance(address)
  const { data: allBadges } = useAllBadges(address)

  const { register, isPending: isRegistering, error: registerError } = useRegister()
  const { deposit, isPending: isDepositing } = useVaultDeposit()
  const { withdraw, isPending: isWithdrawing } = useVaultWithdraw()
  const { createStream, isPending: isStreaming } = useCreateStream()

  const [activeTab, setActiveTab] = useState('tasks')
  const [referrer, setReferrer] = useState('')
  const [copied, setCopied] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [streamAmount, setStreamAmount] = useState('')
  const [streamPeriod, setStreamPeriod] = useState(0)

  const targetChainId = robinhoodTestnet.id

  useEffect(() => {
    const ref = captureReferrer()
    if (ref) setReferrer(ref)
  }, [])

  const isRegistered = userInfo?.exists
  const currentTier = userInfo ? TIERS[userInfo.tierIndex] : null
  const isWrongChain = chainId !== targetChainId

  const handleRegister = () => {
    const ref = referrer || '0x0000000000000000000000000000000000000000'
    register(ref)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(getReferralLink(address))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStartTask = (task) => {
    setSelectedTask(task)
  }

  const handleDeposit = () => {
    if (depositAmount) deposit(Number(depositAmount))
  }

  const handleWithdraw = () => {
    if (withdrawAmount) withdraw(Number(withdrawAmount))
  }

  const handleCreateStream = () => {
    if (streamAmount && STREAM_PERIODS[streamPeriod]) {
      const seconds = STREAM_PERIODS[streamPeriod].months * 30 * 24 * 60 * 60
      createStream(Number(streamAmount), seconds)
    }
  }

  if (selectedTask) {
    return <TaskInterface task={selectedTask} onClose={() => setSelectedTask(null)} />
  }

  if (userLoading) {
    return (
      <div className="dashboard-container">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <div className="logo-box">TV</div>
            <span>TaskVault</span>
          </div>
          <ConnectButton />
        </nav>
        <div className="dashboard-content">
          <div className="skeleton-stats">
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton shimmer" style={{ height: 80, borderRadius: 8 }} />
            ))}
          </div>
          <div className="skeleton-grid">
            {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  if (userError) {
    return (
      <div className="dashboard-container">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <div className="logo-box">TV</div>
            <span>TaskVault</span>
          </div>
          <ConnectButton />
        </nav>
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Failed to load dashboard</h3>
          <p>Could not fetch your data from the blockchain. Check your connection and try again.</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <div className="logo-box">TV</div>
          <span>TaskVault</span>
        </div>
        <div className="nav-links">
          <button className={activeTab === 'tasks' ? 'active' : ''} onClick={() => setActiveTab('tasks')}>
            Tasks
          </button>
          <button className={activeTab === 'earnings' ? 'active' : ''} onClick={() => setActiveTab('earnings')}>
            Earnings
          </button>
          <button className={activeTab === 'tiers' ? 'active' : ''} onClick={() => setActiveTab('tiers')}>
            Tiers
          </button>
          <button className={activeTab === 'vault' ? 'active' : ''} onClick={() => setActiveTab('vault')}>
            Vault
          </button>
        </div>
        <div className="nav-actions">
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </nav>

      {isWrongChain && (
        <div className="chain-banner">
          <span>Wrong network. Switch to {robinhoodTestnet.name} to use TaskVault.</span>
          <button className="btn-primary" onClick={() => switchChain({ chainId: targetChainId })}>
            Switch Network
          </button>
        </div>
      )}

      <main className="dashboard-content">

        {activeTab === 'tasks' && (
          <>
            {isRegistered && (
                <div className="stats-bar">
                <div className="stat-item">
                  <div className="stat-label">Points Balance</div>
                  <div className="stat-value">{formatPoints(userInfo.balance)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Lifetime Earned</div>
                  <div className="stat-value">{formatPoints(userInfo.lifetimeEarned)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Referral Earnings</div>
                  <div className="stat-value">{formatPoints(userInfo.referralEarnings)}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Current Tier</div>
                  <div className="stat-value" style={{ color: currentTier?.color }}>
                    {currentTier?.icon} {currentTier?.name}
                  </div>
                  <div className="stat-sub">{currentTier?.multiplier}x multiplier</div>
                </div>
              </div>
            )}

            {!isRegistered && (
              <div className="register-cta">
                <h2>Welcome to TaskVault</h2>
                <p>Register free to start earning points. No deposits required.</p>

                {registerError && (
                  <div className="error-banner">
                    Registration failed: {registerError.message}
                  </div>
                )}

                <button
                  onClick={handleRegister}
                  disabled={isRegistering || isWrongChain}
                  className="btn-primary lg register-btn"
                >
                  {isRegistering ? 'Registering...' : 'Register Free → Start Earning'}
                </button>

                <div className="balance-hint">
                  USDG Balance: <strong>{formatUSDG(usdcBalance)}</strong> 
                  <span style={{ marginLeft: 8, color: 'var(--tv-text-dim)' }}>
                    (Optional: deposit in Vault for bonuses)
                  </span>
                </div>
              </div>
            )}

            <div className="task-section">
              <div className="section-header">
                <h2>Available Tasks</h2>
                <p>Complete tasks to earn points. Higher tiers unlock higher-value work.</p>
              </div>

              <div className="task-grid">
                {TASK_CATEGORIES.map(task => (
                  <div 
                    key={task.id} 
                    className="task-card"
                    onClick={() => handleStartTask(task)}
                  >
                    <div className="task-card-header">
                      <div className="task-icon" style={{ color: task.color }}>
                        {task.icon}
                      </div>
                      <div className="task-available">{task.available} available</div>
                    </div>
                    <h4 className="task-title">{task.title}</h4>
                    <p className="task-desc">{task.desc}</p>
                    <div className="task-meta">
                      <span className="task-pay">{task.pay}</span>
                      <span className={`task-difficulty ${task.difficulty.toLowerCase()}`}>{task.difficulty}</span>
                    </div>
                    <button className="btn-primary task-btn">
                      Start Task →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {isRegistered && (
              <div className="task-section">
                <div className="section-header">
                  <h2>Your Active Tasks</h2>
                </div>
                <div className="active-tasks">
                  <div className="empty-tasks">
                    <div className="empty-icon">📭</div>
                    <p>No active tasks. Pick one from above to get started!</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'earnings' && isRegistered && (
          <div className="earnings-tab">
            <div className="stats-bar">
              <div className="stat-item">
                <div className="stat-label">Total Points</div>
                <div className="stat-value">{formatPoints(userInfo.balance)}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Lifetime Earned</div>
                <div className="stat-value">{formatPoints(userInfo.lifetimeEarned)}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">From Referrals</div>
                <div className="stat-value">{formatPoints(userInfo.referralEarnings)}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Referrals</div>
                <div className="stat-value">{userInfo?.referralCount?.toString() || 0}</div>
              </div>
            </div>

            <div className="info-card referral-card">
              <h3>Your Referral Link</h3>
              <p>Share and earn 5% of everything your referrals make in points.</p>

              <div className="referral-box">
                <code>{getReferralLink(address)}</code>
                <button onClick={handleCopy} className="btn-secondary">
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>

              <div className="referral-stats">
                <div>
                  <div className="stat-label">Total Referrals</div>
                  <div className="stat-value">{userInfo?.referralCount?.toString() || 0}</div>
                </div>
                <div>
                  <div className="stat-label">Points Earned</div>
                  <div className="stat-value">{formatPoints(userInfo?.referralEarnings)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'earnings' && !isRegistered && (
          <div className="empty-state">
            <div className="empty-icon">🔒</div>
            <h3>Register to view earnings</h3>
            <p>Register free to unlock your earnings dashboard and referral program.</p>
            <button className="btn-primary" onClick={() => setActiveTab('tasks')}>Go to Tasks</button>
          </div>
        )}

        {activeTab === 'tiers' && isRegistered && (
          <div className="tiers-tab">
            <div className="current-tier-card" style={{ borderColor: currentTier?.color }}>
              <div className="current-tier-icon" style={{ color: currentTier?.color }}>
                {currentTier?.icon}
              </div>
              <div>
                <h3>{currentTier?.name} Tier</h3>
                <p>{currentTier?.multiplier}x multiplier // {userInfo?.tasksCompleted?.toString() || 0} tasks completed</p>
              </div>
            </div>

            <h3 style={{ marginTop: 32, marginBottom: 16, fontSize: '1.1rem', fontWeight: 800 }}>Tier Progression</h3>
            <div className="upgrade-grid">
              {TIERS.map((tier, idx) => {
                const isCurrent = idx === userInfo?.tierIndex
                const isUnlocked = idx <= userInfo?.tierIndex
                return (
                  <div key={idx} className="upgrade-card" style={{ 
                    borderColor: isCurrent ? tier.color : undefined,
                    opacity: isUnlocked ? 1 : 0.6
                  }}>
                    <div className="upgrade-header">
                      <span className="upgrade-icon" style={{ color: tier.color }}>
                        {tier.icon}
                      </span>
                      <div>
                        <div className="upgrade-name">{tier.name}</div>
                        <div className="upgrade-multiplier" style={{ color: tier.color }}>{tier.multiplier}x multiplier</div>
                      </div>
                    </div>
                    <div className="upgrade-cost">
                      {tier.tasks === 'Invite' ? 'Invite Only' : `${tier.tasks} tasks + ${tier.accuracy}% accuracy`}
                    </div>
                    {isCurrent && (
                      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--tv-accent)', fontWeight: 700 }}>
                        ← Current Tier
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'tiers' && !isRegistered && (
          <div className="empty-state">
            <div className="empty-icon">🔒</div>
            <h3>Register to view tiers</h3>
            <p>Register free to unlock tier progression and multipliers.</p>
            <button className="btn-primary" onClick={() => setActiveTab('tasks')}>Go to Tasks</button>
          </div>
        )}

        {activeTab === 'vault' && (
          <div>
            <div className="section-header">
              <h2>Vault</h2>
              <p>Deposit USDG to earn bonuses. Optional — not required to complete tasks.</p>
            </div>

            <div className="stats-bar" style={{ marginBottom: 24 }}>
              <div className="stat-item">
                <div className="stat-label">Vault Balance</div>
                <div className="stat-value">{formatUSDG(userInfo?.vaultBalance)} USDG</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Wallet Balance</div>
                <div className="stat-value">{formatUSDG(usdcBalance)} USDG</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Active Streams</div>
                <div className="stat-value">{userInfo?.activeStreams?.toString() || 0}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Current Bonus</div>
                <div className="stat-value">+{userInfo?.vaultMultiplier ? (userInfo.vaultMultiplier / 100).toFixed(2) : '0.00'}x</div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 24 }}>
              <div className="info-card">
                <h3>Deposit</h3>
                <p>Add USDG to your vault balance.</p>
                <input 
                  type="number" 
                  placeholder="Amount in USDG"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--tv-bg-elevated)',
                    border: '1px solid var(--tv-border)',
                    borderRadius: 'var(--tv-radius)',
                    color: 'var(--tv-text)',
                    fontFamily: 'var(--tv-font)',
                    fontSize: 14,
                    marginTop: 12,
                    marginBottom: 12,
                    outline: 'none',
                  }}
                />
                <button 
                  onClick={handleDeposit}
                  disabled={isDepositing || !depositAmount}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  {isDepositing ? 'Depositing...' : 'Deposit USDG'}
                </button>
              </div>

              <div className="info-card">
                <h3>Withdraw</h3>
                <p>Instant withdrawal from vault to wallet.</p>
                <input 
                  type="number" 
                  placeholder="Amount in USDG"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--tv-bg-elevated)',
                    border: '1px solid var(--tv-border)',
                    borderRadius: 'var(--tv-radius)',
                    color: 'var(--tv-text)',
                    fontFamily: 'var(--tv-font)',
                    fontSize: 14,
                    marginTop: 12,
                    marginBottom: 12,
                    outline: 'none',
                  }}
                />
                <button 
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || !withdrawAmount}
                  className="btn-secondary"
                  style={{ width: '100%' }}
                >
                  {isWithdrawing ? 'Withdrawing...' : 'Withdraw USDG'}
                </button>
              </div>
            </div>

            <div className="info-card">
              <h3>Create Stream</h3>
              <p>Stream your vault capital out over time with continuous vesting.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '16px 0' }}>
                {STREAM_PERIODS.map((period, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setStreamPeriod(idx)}
                    style={{
                      padding: 16,
                      background: streamPeriod === idx ? 'var(--tv-bg-elevated)' : 'var(--tv-bg)',
                      border: `1.5px solid ${streamPeriod === idx ? 'var(--tv-accent)' : 'var(--tv-border)'}`,
                      borderRadius: 'var(--tv-radius)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tv-text)', marginBottom: 4 }}>
                      {period.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tv-accent)', fontWeight: 700, fontFamily: 'var(--tv-font-mono)' }}>
                      {period.apr} APR
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tv-text-muted)', marginTop: 4 }}>
                      {period.multiplier} pts
                    </div>
                  </div>
                ))}
              </div>

              <input 
                type="number" 
                placeholder="Amount to stream"
                value={streamAmount}
                onChange={(e) => setStreamAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--tv-bg-elevated)',
                  border: '1px solid var(--tv-border)',
                  borderRadius: 'var(--tv-radius)',
                  color: 'var(--tv-text)',
                  fontFamily: 'var(--tv-font)',
                  fontSize: 14,
                  marginBottom: 12,
                  outline: 'none',
                }}
              />
              <button 
                onClick={handleCreateStream}
                disabled={isStreaming || !streamAmount}
                className="btn-primary"
                style={{ width: '100%' }}
              >
                {isStreaming ? 'Creating Stream...' : `Create ${STREAM_PERIODS[streamPeriod]?.label} Stream`}
              </button>
            </div>
          </div>  
        )}
      </main>
    </div>
  )
}
