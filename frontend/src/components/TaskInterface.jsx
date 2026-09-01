import React, { useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { TASK_GENRES, THEMES } from '../themes';

export default function TaskInterface({ task, onClose }) {
  const { setTheme, resetTheme } = useTheme();
  const genre = TASK_GENRES[task.id] || 'default';

  useEffect(() => {
    setTheme(genre);
    return () => resetTheme();
  }, [genre]);

  const renderTaskWorkspace = () => {
    switch (genre) {
      case 'writing':
        return <WritingWorkspace task={task} />;
      case 'robotics':
        return <RoboticsWorkspace task={task} />;
      case 'llm':
        return <LLMWorkspace task={task} />;
      case 'vision':
        return <VisionWorkspace task={task} />;
      case 'audio':
        return <AudioWorkspace task={task} />;
      case 'safety':
        return <SafetyWorkspace task={task} />;
      default:
        return <GenericWorkspace task={task} />;
    }
  };

  return (
    <div className="task-interface-overlay">
      <div className="task-interface-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 18 }}>
            ←
          </button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Task #{task.id}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tv-text)' }}>
              {task.title}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="task-genre-badge">
            {genre} Mode
          </span>
          <button className="btn-primary">
            Submit Work
          </button>
        </div>
      </div>

      <div className="task-interface-content">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 8, color: 'var(--tv-text)' }}>
            {task.title}
          </h1>
          <p style={{ color: 'var(--tv-text-muted)', fontSize: 15, lineHeight: 1.7 }}>
            {task.desc}
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <span className="task-pay" style={{ color: 'var(--tv-accent)', fontWeight: 800, fontFamily: 'var(--tv-font-mono)' }}>
              {task.pay}
            </span>
            <span className={`task-difficulty ${task.difficulty.toLowerCase()}`}>
              {task.difficulty}
            </span>
          </div>
        </div>

        {renderTaskWorkspace()}
      </div>
    </div>
  );
}

function WritingWorkspace({ task }) {
  return (
    <div className="writing-workspace">
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--tv-border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Prompt
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--tv-text)' }}>
          Write a detailed analysis of the following topic, focusing on clarity and depth. 
          Target audience: technical readers. Word count: 500-800 words.
        </p>
      </div>
      <textarea 
        placeholder="Start writing your response here..."
        style={{ fontFamily: 'var(--tv-font)' }}
      />
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--tv-text-muted)' }}>Auto-saved</span>
        <button className="btn-primary">Save Draft</button>
      </div>
    </div>
  );
}

function RoboticsWorkspace({ task }) {
  return (
    <div>
      <div className="robotics-viewer" style={{ marginBottom: 24 }}>
        <div className="robotics-grid-overlay" />
        <div style={{ textAlign: 'center', color: 'var(--tv-text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🦾</div>
          <p>Robot teleoperation video would load here</p>
          <p style={{ fontSize: 12, marginTop: 8, opacity: 0.6 }}>MP4 // 1920x1080 // 12.4MB</p>
        </div>
      </div>

      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
          Phase Labels
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Approach', 'Grasp', 'Lift', 'Transport', 'Place'].map((phase) => (
            <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--tv-bg)', borderRadius: 'var(--tv-radius)', border: '1px solid var(--tv-border)' }}>
              <span style={{ fontFamily: 'var(--tv-font-mono)', fontSize: 12, color: 'var(--tv-accent)', minWidth: 60 }}>
                00:00
              </span>
              <span style={{ fontWeight: 600, color: 'var(--tv-text)' }}>{phase}</span>
              <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }}>
                Mark Timestamp
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LLMWorkspace({ task }) {
  return (
    <div>
      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Prompt
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)' }}>
          Explain the concept of gradient descent to a 10-year-old.
        </p>
      </div>

      <div className="llm-comparison">
        <div className="llm-response">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Response A
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)' }}>
            Gradient descent is like walking down a hill with your eyes closed. You feel the ground with your feet to find which way is downhill, then take a step that way. You keep doing this until you reach the bottom.
          </p>
          <button className="btn-secondary" style={{ marginTop: 16, width: '100%' }}>
            Select A
          </button>
        </div>
        <div className="llm-response">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Response B
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)' }}>
            Imagine you're on a mountain and want to get to the lowest valley. Gradient descent is like checking which direction is steepest downhill, then taking a small step that way. You repeat until you can't go any lower.
          </p>
          <button className="btn-secondary" style={{ marginTop: 16, width: '100%' }}>
            Select B
          </button>
        </div>
      </div>
    </div>
  );
}

function VisionWorkspace({ task }) {
  return (
    <div>
      <div className="vision-canvas" style={{ marginBottom: 24 }}>
        <div style={{ aspectRatio: '16/9', background: 'var(--tv-bg-elevated)', display: 'grid', placeItems: 'center', color: 'var(--tv-text-muted)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p>Industrial inspection image would load here</p>
            <p style={{ fontSize: 12, marginTop: 8, opacity: 0.6 }}>PNG // 2048x1536 // 4.2MB</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {['No Defect', 'Crack', 'Solder Bridge', 'Discoloration', 'Contamination'].map((label) => (
          <button key={label} className="btn-secondary" style={{ fontSize: 13 }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AudioWorkspace({ task }) {
  return (
    <div>
      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 32, marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎧</div>
        <p style={{ color: 'var(--tv-text-muted)', marginBottom: 16 }}>Audio waveform visualization</p>
        <div style={{ height: 60, background: 'var(--tv-bg)', borderRadius: 'var(--tv-radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 16px' }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{ 
              width: 3, 
              height: `${Math.random() * 40 + 10}px`, 
              background: 'var(--tv-accent)', 
              borderRadius: 2,
              opacity: 0.6 + Math.random() * 0.4
            }} />
          ))}
        </div>
      </div>

      <div className="writing-workspace">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Transcription
        </h3>
        <textarea 
          placeholder="Type what you hear..."
          style={{ fontFamily: 'var(--tv-font)', minHeight: 120 }}
        />
      </div>
    </div>
  );
}

function SafetyWorkspace({ task }) {
  return (
    <div>
      <div className="safety-warning">
        <span style={{ fontSize: 20 }}>⚠️</span>
        <span>This task involves identifying potentially harmful content. Proceed with professional discretion.</span>
      </div>

      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Prompt to Evaluate
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)', padding: 16, background: 'var(--tv-bg)', borderRadius: 'var(--tv-radius)' }}>
          [Redacted prompt content would appear here for safety review]
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {['Safe', 'Mild Risk', 'High Risk', 'Critical'].map((level) => (
          <button key={level} className="btn-secondary" style={{ 
            borderColor: level === 'Critical' ? 'var(--tv-danger)' : undefined,
            color: level === 'Critical' ? 'var(--tv-danger)' : undefined
          }}>
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenericWorkspace({ task }) {
  return (
    <div className="writing-workspace">
      <p style={{ color: 'var(--tv-text-muted)' }}>
        Task workspace for {task.title}. This would be customized based on the specific task requirements.
      </p>
    </div>
  );
}
