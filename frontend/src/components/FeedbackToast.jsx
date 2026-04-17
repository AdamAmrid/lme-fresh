import React, { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';

const STYLE_MAP = {
  Struggling: { bg: '#F59E0B', icon: '🚨' },
  Unengaged:  { bg: '#EF4444', icon: '⚠️'  },
  Engaged:    { bg: '#4ECDC4', icon: '💡' },
};

export default function FeedbackToast({ message, state, onClose }) {
  const [progress, setProgress] = useState(100);
  const DURATION = 5000;

  // Keep onClose in a ref so it's never a useEffect dependency —
  // this prevents the timer from restarting on every parent re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // This effect runs ONLY when `message` changes (a genuinely new notification).
  useEffect(() => {
    if (!message) return;

    // Reset progress bar
    setProgress(100);

    // Drain the progress bar over DURATION
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev - (100 / (DURATION / 100));
        return next <= 0 ? 0 : next;
      });
    }, 100);

    // Auto-dismiss once
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, DURATION);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [message]); // ← ONLY message, NOT onClose — this is the critical fix

  if (!message) return null;

  const { bg: bgColor, icon } = STYLE_MAP[state] || STYLE_MAP['Engaged'];

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        top: '12px',
        left: 0,
        right: 0,
        marginLeft: 'auto',
        marginRight: 'auto',
        width: 'fit-content',
        maxWidth: 'calc(100vw - 2rem)',
        backgroundColor: bgColor,
        color: 'white',
        padding: '0.9rem 1.4rem',
        borderRadius: '14px',
        zIndex: 9999,
        boxShadow: '0 8px 28px rgba(0,0,0,0.20)',
        fontWeight: '700',
        fontFamily: 'var(--font-body)',
        borderBottom: '4px solid rgba(0,0,0,0.12)',
      }}
    >
      {/* Content row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '0.95rem' }}>{message}</span>
        <button
          onClick={() => onCloseRef.current()}
          style={{
            background: 'rgba(255,255,255,0.22)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            flexShrink: 0,
            transition: '0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
        >
          <FiX size={15} />
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, width: '100%',
        height: '4px', background: 'rgba(0,0,0,0.12)',
        borderRadius: '0 0 14px 14px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: 'rgba(255,255,255,0.55)',
          transition: 'width 0.1s linear',
        }} />
      </div>
    </div>
  );
}
