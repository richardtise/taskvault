import React, { useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { useTheme } from './ThemeProvider';
import { resolveGenre } from '../themes';
import { useTaskMetrics, fetchTaskDetail, AUTH_TOKEN_KEY } from '../hooks';
import { robinhoodTestnet } from '../wagmi-config';

// Only render media we can actually load; ipfs:// (and missing) values fall
// back to the existing placeholders instead of rendering a broken element.
function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
}

function assetUrl(task, type) {
  if (!Array.isArray(task?.assets)) return null;
  const asset = task.assets.find((a) => a?.type === type && httpUrl(a?.url));
  return asset ? asset.url : null;
}

export default function TaskInterface({ task, onClose, authenticate, isAuthenticated }) {
  const { setTheme, resetTheme } = useTheme();
  const chainId = useChainId();
  const isWrongChain = chainId !== robinhoodTestnet.id;
  const { startTracking, stopTracking, getMetrics } = useTaskMetrics();

  // `task` comes from the list endpoint, which strips `taskData`; enrich it from
  // the detail endpoint when possible.
  const [fullTask, setFullTask] = useState(task);
  const [answer, setAnswer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const current = fullTask || task || {};
  const genre = resolveGenre(current);
  const taskId = current.taskId || current.id;
  const title = current.title || 'Task';
  const description = current.description || current.desc || '';
  const instructions = current.instructions;

  useEffect(() => {
    setTheme(genre);
    startTracking();
    return () => {
      stopTracking();
      resetTheme();
    };
  }, [genre, setTheme, resetTheme, startTracking, stopTracking]);

  useEffect(() => {
    let cancelled = false;
    if (!task?.taskId || task.taskData) {
      setFullTask(task);
      return undefined;
    }
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return undefined;

    fetchTaskDetail(task.taskId, token)
      .then((detail) => {
        if (!cancelled && detail) {
          setFullTask((prev) => ({ ...(prev || task), ...detail }));
        }
      })
      .catch(() => { /* keep the list payload as a fallback */ });

    return () => { cancelled = true; };
  }, [task, isAuthenticated]);

  const handleSubmit = async () => {
    if (!answer || submitting) return;
    if (!taskId) {
      setError('This task has no id and cannot be submitted.');
      return;
    }

    setSubmitting(true);
    setError(null);
    stopTracking();
    const metrics = getMetrics();
    const body = JSON.stringify({
      answer,
      timeSpentSeconds: Math.round(metrics.timeSpentMs / 1000),
      metrics,
    });

    const post = (token) => fetch(`/api/tasks/${encodeURIComponent(taskId)}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });

    try {
      let res = await post(localStorage.getItem(AUTH_TOKEN_KEY));

      // Expired/missing session: re-authenticate once and retry the submit.
      if (res.status === 401 && authenticate) {
        await authenticate();
        res = await post(localStorage.getItem(AUTH_TOKEN_KEY));
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSubmitted(true);
        setTimeout(() => onClose(), 1500);
      } else {
        setError(data.error || `Submission failed (${res.status})`);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err?.message || 'Network error');
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
    const props = { task: current, onAnswer: setAnswer, answer };
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
              Task #{taskId}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tv-text)' }}>
              {title}
            </div>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!answer || submitting || isWrongChain}
        >
          {submitting ? 'Submitting...' : 'Submit Work'}
        </button>
      </div>
      <div className="task-interface-content">
        {isWrongChain && (
          <div className="chain-banner" style={{ marginBottom: 16 }}>
            <span>Wrong network. Switch to {robinhoodTestnet.name} to submit work.</span>
          </div>
        )}
        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        {!isAuthenticated && (
          <div className="chain-banner" style={{ marginBottom: 16 }}>
            <span>Sign in with your wallet to submit — you may be asked to sign a message.</span>
          </div>
        )}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 8, color: 'var(--tv-text)' }}>
            {title}
          </h1>
          {description && (
            <p style={{ color: 'var(--tv-text-muted)', fontSize: 15, lineHeight: 1.7 }}>
              {description}
            </p>
          )}
          {instructions && (
            <p style={{ color: 'var(--tv-text-muted)', fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>
              <strong style={{ color: 'var(--tv-text)' }}>Instructions: </strong>{instructions}
            </p>
          )}
        </div>
        {renderWorkspace()}
      </div>
    </div>
  );
}

function InfoPanel({ heading, children }) {
  return (
    <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 20, marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        {heading}
      </h3>
      {children}
    </div>
  );
}

function WritingWorkspace({ task, onAnswer, answer }) {
  const [text, setText] = useState(answer?.text || '');
  const source = task?.taskData?.text;
  return (
    <div className="writing-workspace">
      {source && (
        <InfoPanel heading="Source Text">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)', whiteSpace: 'pre-wrap' }}>
            {source}
          </p>
        </InfoPanel>
      )}
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
  const data = task?.taskData || {};
  const prompt = data.prompt;
  const responses = { A: data.responseA, B: data.responseB };
  return (
    <div>
      <InfoPanel heading="Prompt">
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tv-text)' }}>
          {prompt || task?.instructions || 'No prompt was provided for this task.'}
        </p>
      </InfoPanel>
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
              {responses[opt] || 'Response content is not available for this task.'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoboticsWorkspace({ task, onAnswer, answer }) {
  const [phases, setPhases] = useState(answer?.phases || []);
  const data = task?.taskData || {};
  const phaseNames = Array.isArray(data.phases) && data.phases.length
    ? data.phases
    : ['Approach', 'Grasp', 'Lift', 'Transport', 'Place'];
  const videoUrl = httpUrl(data.videoUrl) || assetUrl(task, 'video');

  const addPhase = (name) => {
    const updated = [...phases, { name, timestamp: Date.now() }];
    setPhases(updated);
    onAnswer({ type: 'robotics', phases: updated });
  };

  return (
    <div>
      <div className="robotics-viewer" style={{ marginBottom: 24, aspectRatio: '16/9', background: 'var(--tv-bg-elevated)', display: 'grid', placeItems: 'center' }}>
        {videoUrl ? (
          <video controls src={videoUrl} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--tv-text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🦾</div>
            <p>Robot teleoperation video would load here</p>
          </div>
        )}
      </div>
      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--tv-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
          Phase Labels
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {phaseNames.map((phase) => (
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
  const data = task?.taskData || {};
  const defectTypes = Array.isArray(data.defectTypes) && data.defectTypes.length
    ? data.defectTypes
    : ['No Defect', 'Crack', 'Solder Bridge', 'Discoloration', 'Contamination'];
  const imageUrl = httpUrl(data.imageUrl) || assetUrl(task, 'image');

  const toggle = (label) => {
    const updated = labels.includes(label) 
      ? labels.filter(l => l !== label) 
      : [...labels, label];
    setLabels(updated);
    onAnswer({ type: 'vision', labels: updated });
  };

  return (
    <div>
      <div className="vision-canvas" style={{ marginBottom: 24, aspectRatio: '16/9', background: 'var(--tv-bg-elevated)', display: 'grid', placeItems: 'center', color: 'var(--tv-text-muted)', overflow: 'hidden' }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Inspection" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p>Industrial inspection image would load here</p>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {defectTypes.map((label) => (
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
  const data = task?.taskData || {};
  const audioUrl = httpUrl(data.audioUrl) || assetUrl(task, 'audio');
  return (
    <div>
      <div style={{ background: 'var(--tv-bg-panel)', border: '1px solid var(--tv-border)', borderRadius: 'var(--tv-radius)', padding: 32, marginBottom: 24, textAlign: 'center' }}>
        {audioUrl ? (
          <audio controls src={audioUrl} style={{ width: '100%' }} />
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎧</div>
            <p style={{ color: 'var(--tv-text-muted)', marginBottom: 16 }}>Audio waveform visualization</p>
          </>
        )}
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
  const categories = Array.isArray(task?.taskData?.safetyCategories) ? task.taskData.safetyCategories : [];
  return (
    <div>
      <div className="safety-warning">
        <span style={{ fontSize: 20 }}>⚠️</span>
        <span>This task involves identifying potentially harmful content.</span>
      </div>
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {categories.map((c) => (
            <span key={c} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--tv-border)', borderRadius: 999, color: 'var(--tv-text-muted)' }}>
              {c}
            </span>
          ))}
        </div>
      )}
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
