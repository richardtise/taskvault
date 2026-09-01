import React from 'react';
import { useTheme } from './ThemeProvider';

export default function BackgroundEffect() {
  const { currentTheme } = useTheme();

  // Only show subtle effects for dark themes
  if (currentTheme === 'writing') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, transparent 100%)',
      }} />
    );
  }

  return (
    <div 
      className="bg-effect"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundImage: 'var(--tv-bg-image)',
        backgroundSize: 'var(--tv-bg-size)',
        opacity: 0.6,
        transition: 'all 0.8s ease',
      }}
    />
  );
}
