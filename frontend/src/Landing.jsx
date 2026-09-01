import React from "react"
import { ConnectButton } from '@rainbow-me/rainbowkit'

const TIERS = [
  { name: 'Scout', tasks: 0, accuracy: 0, multiplier: '1.0x', desc: 'Entry-level tasks. Image labeling, data verification, simple rankings.', icon: '🔭' },
  { name: 'Operator', tasks: 50, accuracy: 85, multiplier: '1.5x', desc: 'Multi-step annotation, audio verification, 3D bounding boxes.', icon: '⚙️' },
  { name: 'Specialist', tasks: 200, accuracy: 90, multiplier: '2.5x', desc: 'Robotics phase labeling, safety red-teaming, synthetic prompts.', icon: '🎯' },
  { name: 'Expert', tasks: 500, accuracy: 95, multiplier: '4.0x', desc: 'Medical imaging, policy review, quality audit of lower-tier work.', icon: '🔬' },
  { name: 'Architect', tasks: 'Invite', accuracy: 98, multiplier: '6.0x', desc: 'Governance, early access, private task pools. Invite-only.', icon: '🏛️' },
]

const STEPS = [
  { step: 1, title: 'Register', desc: 'Connect your wallet. No deposits, no fees. Start immediately.', color: '#00d4aa', icon: '01' },
  { step: 2, title: 'Pick Tasks', desc: 'Browse tasks matched to your skills. From simple reviews to expert work.', color: '#6366f1', icon: '02' },
  { step: 3, title: 'Complete Work', desc: 'Follow instructions, submit quality work. Points issued on-chain.', color: '#f59e0b', icon: '03' },
  { step: 4, title: 'Level Up', desc: 'Build reputation, climb tiers, unlock higher-value tasks and multipliers.', color: '#ef4444', icon: '04' },
]

const REASONS = [
  { title: 'Proof of Contribution', desc: 'Every approved task is recorded on-chain. Build a permanent, verifiable reputation that compounds over time.', icon: '◆' },
  { title: 'Skill-Based Growth', desc: 'Start at Scout and work your way to Architect. Your access and influence scale with skill, not stake.', icon: '▲' },
  { title: 'Fast Feedback', desc: 'Most tasks reviewed within 24-48 hours. Keep momentum, ship more work, and climb tiers faster.', icon: '■' },
]

export default function Landing() {
  return (
    <div className="landing">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="logo-box">TV</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--tv-text)', letterSpacing: '-0.02em' }}>
            TaskVault
          </span>
        </div>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button onClick={openConnectModal} className="btn-primary">
              Connect Wallet
            </button>
          )}
        </ConnectButton.Custom>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">
          <span className="dot" />
          <span>Robinhood Chain // Points Economy</span>
        </div>
        <h1>
          Train AI.<br />
          <span className="accent">Earn Points.</span><br />
          Level Up.
        </h1>
        <p className="lead">
          TaskVault is a decentralized task marketplace where your work trains 
          physical AI — from humanoid robots to LLMs. Register free, complete tasks, 
          earn points. The more skilled your work, the more you earn.
        </p>
        <div className="hero-cta">
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button onClick={openConnectModal} className="btn-primary lg">
                Start Earning →
              </button>
            )}
          </ConnectButton.Custom>
          <a href="#tiers" className="btn-secondary lg">
            View Tiers
          </a>
        </div>
        <div className="landing-stats">
          <div>
            <strong>6</strong>
            <span>Task Categories</span>
          </div>
          <div>
            <strong>0</strong>
            <span>Points Issued</span>
          </div>
          <div>
            <strong>0</strong>
            <span>Contributors</span>
          </div>
          <div>
            <strong>5</strong>
            <span>Tier Levels</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <h2>How It Works</h2>
        <p className="sub">
          Four steps to start earning. The more you commit, the more you earn.
        </p>
        <div className="grid-2">
          {STEPS.map((s) => (
            <div key={s.step} className="card">
              <div className="icon-box" style={{ color: s.color, borderColor: s.color }}>
                {s.icon}
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="section" id="tiers">
        <h2>Tier System</h2>
        <p className="sub">
          Each tier unlocks higher-value tasks and multipliers. No deposits required — progress is earned through work.
        </p>
        <div className="grid-2">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`card tier-card ${t.name === 'Specialist' ? 'popular' : ''}`}
            >
              <div className="tier-icon">{t.icon}</div>
              <h3>{t.name}</h3>
              <div style={{ fontSize: 13, color: 'var(--tv-text-muted)', marginBottom: 8 }}>
                {t.tasks === 'Invite' ? 'Invite Only' : `${t.tasks} tasks + ${t.accuracy}% accuracy`}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tv-accent)', fontFamily: 'var(--tv-font-mono)', marginBottom: 12 }}>
                {t.multiplier}
              </div>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="section">
        <h2>Why TaskVault</h2>
        <div className="grid-3">
          {REASONS.map((r) => (
            <div key={r.title} className="card">
              <div className="icon-box">{r.icon}</div>
              <h3>{r.title}</h3>
              <p>{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="section cta-section">
        <h2>Ready to deploy?</h2>
        <p className="sub">
          Join the first wave of contributors. Register free, start training AI, 
          and build your reputation.
        </p>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button onClick={openConnectModal} className="btn-primary lg">
              Get Started →
            </button>
          )}
        </ConnectButton.Custom>
      </section>

      <footer className="footer">
        TaskVault v1.0.0 // {new Date().getFullYear()} // Decentralized AI Data Layer
      </footer>
    </div>
  )
}
