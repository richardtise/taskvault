import React, { useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { TASK_GENRES, THEMES } from '../themes';
import { useTaskMetrics } from '../hooks';

export default function TaskInterface({ task, onClose }) {
  const { setTheme, resetTheme } = useTheme();
  const genre = TASK_GENRES[task.id] || 'default';
  const { startTracking, stopTracking, getMetrics } = useTaskMetrics();
  const [answer, setAnswer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setTheme(genre);
    startTracking();
    return () => {
      stopTracking();
      resetTheme();
    };
  }, [genre]);

  const handleSubmit = async () => {
    if (!answer || submitting) return;
    setSubmitting(true);
    stopTracking();
    const metrics = getMetrics();

    try {
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('taskvault_token') || ''}`
        },
        body: JSON.stringify({
          answer,
          timeSpentSeconds: Math.round(metrics.timeSpentMs / 1000),
          metrics,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setTimeout(() => onClose(), 1500);
      } else {
        alert(data.error || 'Submission failed');
        setSubmitting(false);
      }
    } catch (err) {
      alert('Network error');
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="task-interface-overlay" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: 'var(--tv-text)' }}>Submitted!</h2>
          <p style={{ color: 'var(--tv-text-muted)' }}>Your work is being verified.</p>
        </div>
      </div>
    );
  }

  const renderWorkspace = () => {
    const props = { task, onAnswer: setAnswer, answer };
    switch (genre) {
      case 'writing': return <WritingWorkspace {...props} />;
      case 'robotics': return <RoboticsWorkspace {...props} />;
      case 'llm': return <LLMWorkspace {...props} />;
      case 'vision': return <VisionWorkspace {...props} />;
      case 'audio': return <AudioWorkspace {...props} />;
      case 'safety': return <SafetyWorkspace {...props} />;
      default: return <GenericWorkspace {...props} />;
    }
  };

  return (
    <div className="task-interface-overlay">
      <div className="task-interface-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 18 }}>←</button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Task #{task.id}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tv-text)' }}>
              {task.title}
            </div>
          </div>
        </div>
        <button 
          className="btn-primary" 
          onClick={handleSubmit}
          disabled={!answer || submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Work'}
        </button>
      </div>
      <div className="task-interface-content">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 8, color: 'var(--tv-text)' }}>
            {task.title}
          </h1>
          <p style={{ color: 'var(--tv-text-muted)', fontSize: 15, lineHeight: 1.7 }}>
            {task.desc}
          </p>
        </div>
        {renderWorkspace()}
      </div>
    </div>
  );
}

function WritingWorkspace({ task, onAnswer, answer }) {
  const [text, setText] = useState(answer?.text || '');
  return (
    <div className="writing-workspace">
      <textarea 
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onAnswer({ type: 'writing', text: e.target.value, wordCount: e.target.value.split(/\s+/).filter(w => w).length });
        }}
        placeholder="Start writing your response here..."
        style={{ fontFamily: 'var(--tv-font)', minHeight: 300 }}
      />
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--tv-text-muted)' }}>
          {text.split(/\s+/).filter(w => w).length} words
        </span>
      </div>
    </div>
  );
}

function LLMWorkspace({ task, onAnswer, answer }) {
  const [choice, setChoice] = useState(answer?.choice || null);
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
        {['A', 'B'].map((opt) => (
          <div 
            key={opt} 
            className="llm-response" 
            onClick={() => {
              setChoice(opt);
              onAnswer({ type: 'llm-rank', choice: opt });
            }}
            style={{ 
              border: choice === opt ? '2px solid var(--tv-accent)' : '1px solid var(--tv-border)',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              Response {opt}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)' }}>
              {opt === 'A' 
                ? "Gradient descent is like walking down a hill with your eyes closed..." 
                : "Imagine you're on a mountain and want to get to the lowest valley..."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoboticsWorkspace({ task, onAnswer, answer }) {
  const [phases, setPhases] = useState(answer?.phases || []);
  const addPhase = (name) => {
    const updated = [...phases, { name, timestamp: Date.now() }];
    setPhases(updated);
    onAnswer({ type: 'robotics', phases: updated });
  };
  return (
    <div>
      <div className="robotics-viewer" style={{ marginBottom: 24, aspectRatio: '16/9', background: 'var(--tv-bg-elevated)', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--tv-text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🦾</div>
          <p>Robot teleoperation video would load here</p>
        </div>
      </div>
      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
          Phase Labels
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Approach', 'Grasp', 'Lift', 'Transport', 'Place'].map((phase) => (
            <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--tv-bg)', borderRadius: 'var(--tv-radius)', border: '1px solid var(--tv-border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--tv-text)' }}>{phase}</span>
              <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => addPhase(phase)}>
                Mark Timestamp
              </button>
            </div>
          ))}
        </div>
        {phases.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--tv-text-muted)' }}>
            Marked: {phases.map(p => p.name).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function VisionWorkspace({ task, onAnswer, answer }) {
  const [labels, setLabels] = useState(answer?.labels || []);
  const toggle = (label) => {
    const updated = labels.includes(label) 
      ? labels.filter(l => l !== label) 
      : [...labels, label];
    setLabels(updated);
    onAnswer({ type: 'vision', labels: updated });
  };
  return (
    <div>
      <div className="vision-canvas" style={{ marginBottom: 24, aspectRatio: '16/9', background: 'var(--tv-bg-elevated)', display: 'grid', placeItems: 'center', color: 'var(--tv-text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <p>Industrial inspection image would load here</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {['No Defect', 'Crack', 'Solder Bridge', 'Discoloration', 'Contamination'].map((label) => (
          <button 
            key={label} 
            className="btn-secondary" 
            style={{ 
              fontSize: 13,
              background: labels.includes(label) ? 'var(--tv-accent)' : undefined,
              color: labels.includes(label) ? '#fff' : undefined
            }}
            onClick={() => toggle(label)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AudioWorkspace({ task, onAnswer, answer }) {
  const [text, setText] = useState(answer?.text || '');
  return (
    <div>
      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 32, marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎧</div>
        <p style={{ color: 'var(--tv-text-muted)', marginBottom: 16 }}>Audio waveform visualization</p>
      </div>
      <div className="writing-workspace">
        <textarea 
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onAnswer({ type: 'audio', text: e.target.value });
          }}
          placeholder="Type what you hear..."
          style={{ fontFamily: 'var(--tv-font)', minHeight: 120 }}
        />
      </div>
    </div>
  );
}

function SafetyWorkspace({ task, onAnswer, answer }) {
  const [level, setLevel] = useState(answer?.level || null);
  return (
    <div>
      <div className="safety-warning">
        <span style={{ fontSize: 20 }}>⚠️</span>
        <span>This task involves identifying potentially harmful content.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 24 }}>
        {['Safe', 'Mild Risk', 'High Risk', 'Critical'].map((l) => (
          <button 
            key={l} 
            className="btn-secondary" 
            style={{ 
              borderColor: l === level ? 'var(--tv-accent)' : undefined,
              background: l === level ? 'var(--tv-accent)' : undefined,
              color: l === level ? '#fff' : undefined
            }}
            onClick={() => {
              setLevel(l);
              onAnswer({ type: 'safety', level: l });
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenericWorkspace({ task, onAnswer, answer }) {
  const [text, setText] = useState(answer?.text || '');
  return (
    <div className="writing-workspace">
      <textarea 
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onAnswer({ type: 'generic', text: e.target.value });
        }}
        placeholder="Enter your response..."
        style={{ fontFamily: 'var(--tv-font)', minHeight: 200 }}
      />
    </div>
  );
}
