import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [role, setRole]         = useState('student');
  const [error, setError]       = useState(null);
  
  const { user, login, register } = useContext(AuthContext);
  const navigate = useNavigate();

  const highlights = ["Predictive Analytics", "Cognitive Modeling", "Real-time Telemetry"];
  const [highlightIdx, setHighlightIdx] = useState(0);

  useEffect(() => {
    if (user) navigate(user.role === 'instructor' ? '/dashboard' : '/quiz');
  }, [user, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightIdx(prev => (prev + 1) % highlights.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRegistering) {
        await register(email, password, role, name || 'Learner');
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please try again.');
    }
  };

  /* ── Styles ───────────────────────────────────────────────── */
  const globalBg = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
    fontFamily: '"Inter", sans-serif',
    // Mesh Gradient (Indigo/Slate/Violet)
    background: `
      radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.15) 0px, transparent 50%),
      radial-gradient(at 100% 0%, rgba(124, 58, 237, 0.15) 0px, transparent 50%),
      radial-gradient(at 50% 100%, rgba(100, 116, 139, 0.15) 0px, transparent 50%),
      #f8fafc
    `,
  };

  const containerStyle = {
    background: 'rgba(255, 255, 255, 0.75)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(61, 82, 160, 0.15)',
    width: '100%',
    maxWidth: '1000px',
    overflow: 'hidden',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.9rem 1.1rem',
    border: '1.5px solid #E2E8F0',
    borderRadius: '12px',
    fontSize: '1rem',
    fontFamily: '"Inter", sans-serif',
    background: 'rgba(255, 255, 255, 0.9)',
    outline: 'none',
    transition: 'all 0.2s ease',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  };

  const buttonStyle = {
    marginTop: '1rem',
    padding: '1.1rem',
    width: '100%',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '700',
    fontFamily: '"Inter", sans-serif',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 8px 20px rgba(124, 58, 237, 0.25)',
  };

  return (
    <div style={globalBg}>
      <style>{`
        .auth-container { 
          display: grid; 
          grid-template-columns: 1fr; 
        }
        .auth-left { display: none; }
        
        @media (min-width: 860px) {
          .auth-container { grid-template-columns: 1fr 1fr; }
          .auth-left { 
            display: flex; 
            flex-direction: column; 
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(124, 58, 237, 0.05));
            border-right: 1px solid rgba(255, 255, 255, 0.3);
          }
        }

        .input-glow:focus {
          border-color: #7c3aed !important;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15) !important;
        }

        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(124, 58, 237, 0.35) !important;
        }

        .highlight-text {
          animation: fade-up 3s infinite ease-in-out;
        }

        @keyframes fade-up {
          0%, 100% { opacity: 0; transform: translateY(10px); }
          20%, 80% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="auth-container fade-in" style={containerStyle}>
        
        {/* LEFT COLUMN: Highlights */}
        <div className="auth-left" style={{ padding: '4rem', justifyContent: 'space-between' }}>
          <div>
            <div style={{ width: '80px', height: '80px', marginBottom: '2rem' }}>
              <img src="/logo.png" alt="LME Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#0F172A', lineHeight: '1.1', marginBottom: '1rem' }}>
              Intelligent Gateway<br/>
              <span style={{ color: '#4f46e5' }}>to Learning.</span>
            </h1>
            <p style={{ color: '#64748B', fontSize: '1.1rem', lineHeight: '1.6', maxWidth: '300px' }}>
              LME adapts to your individual cognitive footprint to deliver unprecedented educational growth.
            </p>
          </div>

          <div style={{ marginTop: '4rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Platform Highlights
            </p>
            <div style={{ height: '40px', marginTop: '0.5rem', overflow: 'hidden', position: 'relative' }}>
              <strong 
                key={highlightIdx}
                className="highlight-text"
                style={{ 
                  position: 'absolute', 
                  fontSize: '1.3rem', 
                  color: '#7c3aed', 
                  fontWeight: '800' 
                }}
              >
                {highlights[highlightIdx]}
              </strong>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Form */}
        <div style={{ padding: '4rem 3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.4)' }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A', margin: '0 0 0.5rem 0' }}>
              {isRegistering ? 'Create an Account' : 'Welcome Back'}
            </h2>
            <p style={{ color: '#64748B', margin: 0 }}>
              {isRegistering ? 'Start your specialized learning journey.' : 'Enter your credentials to continue.'}
            </p>
          </div>

          {error && (
            <div style={{
              background: 'rgba(254, 226, 226, 0.5)', color: '#DC2626',
              padding: '1rem', borderRadius: '12px',
              marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: '600',
              border: '1px solid #FECACA',
              backdropFilter: 'blur(4px)'
            }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Smooth Segmented Control (Role Selector) */}
            {isRegistering && (
              <div>
                <span style={labelStyle}>Select Role</span>
                <div style={{ position: 'relative', display: 'flex', background: 'rgba(241, 245, 249, 0.7)', borderRadius: '14px', padding: '6px', border: '1px solid #E2E8F0' }}>
                  <div style={{
                    position: 'absolute', top: '6px', bottom: '6px',
                    width: 'calc(50% - 6px)', left: role === 'student' ? '6px' : '50%',
                    background: 'white', borderRadius: '10px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                  {['student', 'instructor'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      style={{
                        position: 'relative', flex: 1, padding: '0.65rem',
                        border: 'none', background: 'transparent',
                        color: role === r ? '#0F172A' : '#64748B',
                        fontWeight: '700', fontSize: '0.9rem',
                        textTransform: 'capitalize', cursor: 'pointer',
                        zIndex: 1, transition: 'color 0.3s'
                      }}
                    >
                      {r === 'student' ? '🎓 Learner' : '📋 Educator'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isRegistering && (
              <div>
                <label style={labelStyle}>Full Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="input-glow"
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="input-glow"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="input-glow"
                style={inputStyle}
              />
            </div>

            <button type="submit" className="cta-btn" style={buttonStyle}>
              {isRegistering ? 'Create User Profile' : 'Sign In'}
            </button>
          </form>

          <p 
            onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
            style={{ textAlign: 'center', marginTop: '2rem', cursor: 'pointer', fontSize: '0.95rem', color: '#64748B', fontWeight: '500' }}
          >
            {isRegistering
              ? <>Already established? <span style={{ color: '#7c3aed', fontWeight: '700' }}>Sign In</span></>
              : <>New to LME? <span style={{ color: '#7c3aed', fontWeight: '700' }}>Create an Account</span></>
            }
          </p>
        </div>

      </div>
    </div>
  );
}
