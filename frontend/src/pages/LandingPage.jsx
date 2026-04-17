import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const scrollTo = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

/* ─── Custom Hook for Scroll Reveals (The "Motions") ─────────────────────── */
const useScrollReveal = (options = {}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        if (options.once) observer.unobserve(entry.target);
      }
    }, { threshold: 0.1, ...options });

    const currentElem = elementRef.current;
    if (currentElem) observer.observe(currentElem);
    return () => { if (currentElem) observer.unobserve(currentElem); };
  }, [options]);

  return [elementRef, isVisible];
};


/* ─── Inline styles (Absolute Amira Specs) ─────────────────────────────── */
const styles = {
  page: {
    fontFamily: "'DM Sans', sans-serif",
    color: '#262626',
    background: '#fff',
    overflowX: 'hidden',
    lineHeight: 1.5,
  },
  navbar: {
    position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    padding: '0 8%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 80, transition: 'all 0.3s ease',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' },
  logoIcon: { width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoName: { fontSize: 24, fontWeight: 700, color: '#262626', letterSpacing: '-0.02em' },
  navLink: {
    background: 'none', border: 'none', fontFamily: "'DM Sans', sans-serif",
    fontSize: 16, color: '#262626', cursor: 'pointer', fontWeight: 500, marginLeft: 32, opacity: 0.8,
  },
  navPillBtn: {
    fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 600,
    background: '#262626', border: 'none', borderRadius: 50,
    color: '#fff', padding: '12px 30px', cursor: 'pointer', marginLeft: 32, transition: 'all 0.28s ease',
  },
  hero: {
    minHeight: '85vh', display: 'flex', alignItems: 'center', padding: '100px 8%',
    background: 'linear-gradient(180deg, #F9FAFB 0%, #fff 100%)', position: 'relative', gap: 60,
  },
  heroContent: { flex: 1, textAlign: 'left' },
  heroVisual: { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center' },
  heroHeadline: { fontSize: 'clamp(44px, 5.5vw, 64px)', fontWeight: 600, color: '#262626', lineHeight: 1.1, marginBottom: 32, letterSpacing: '-0.03em' },
  heroSub: { fontSize: 20, color: '#4B5563', maxWidth: 540, lineHeight: 1.6, marginBottom: 44, fontWeight: 300 },
  ctaPillPrimary: {
    fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600,
    background: '#262626', color: '#fff', border: 'none', borderRadius: 50, padding: '16px 40px',
    cursor: 'pointer', transition: 'all 0.28s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
  },
  ctaPillSecondary: {
    fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600,
    background: 'transparent', color: '#262626', border: '2px solid #E5E7EB',
    borderRadius: 50, padding: '16px 40px', cursor: 'pointer', marginLeft: 16, transition: 'all 0.28s ease',
  },
  avatarWrapper: {
    width: 380, height: 380, background: '#fff', borderRadius: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 40px 100px rgba(0,0,0,0.06)', position: 'relative', animation: 'heroFloat 6s ease-in-out infinite',
    overflow: 'hidden',
  },
  badgeFloating: {
    position: 'absolute', top: -10, right: -50, background: '#fff', padding: '16px 24px', borderRadius: 24,
    boxShadow: '0 20px 40px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 12,
    whiteSpace: 'nowrap', zIndex: 10,
  },
  statsSection: { padding: '100px 8%', background: '#fff', textAlign: 'center' },
  statsGrid: { display: 'flex', justifyContent: 'center', gap: 120, flexWrap: 'wrap' },
  statValue: { fontSize: 54, fontWeight: 600, color: '#262626', marginBottom: 12 },
  statLabel: { fontSize: 16, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  section: { padding: '140px 8%', textAlign: 'center' },
  sectionTitle: { fontSize: 44, fontWeight: 600, color: '#262626', marginBottom: 24, letterSpacing: '-0.02em' },
  sectionDesc: { fontSize: 18, color: '#4B5563', maxWidth: 680, margin: '0 auto 80px', fontWeight: 300 },
  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 40 },
  featureCard: { background: '#fff', borderRadius: 40, padding: '60px 40px', textAlign: 'left', border: '1px solid #F3F4F6', transition: 'all 0.4s ease', cursor: 'default' },
  featurePill: { display: 'inline-flex', padding: '6px 16px', borderRadius: 50, background: '#F3F4F6', fontSize: 13, fontWeight: 600, color: '#4B5563', marginBottom: 24 }
};

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (document.getElementById('amira-motions-styles')) return;
    const style = document.createElement('style');
    style.id = 'amira-motions-styles';
    style.innerHTML = `
      @keyframes heroFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
      .reveal { opacity: 0; transform: translateY(30px); transition: all 1s cubic-bezier(0.165, 0.84, 0.44, 1); }
      .reveal.active { opacity: 1; transform: translateY(0); }
      .btn-pill:hover { background: #000 !important; transform: translateY(-1px); }
      .card-hover:hover { transform: translateY(-8px); box-shadow: 0 30px 60px rgba(0,0,0,0.08) !important; }
    `;
    document.head.appendChild(style);
  }, []);

  const [heroRef, heroActive] = useScrollReveal();
  const [statsRef, statsActive] = useScrollReveal();
  const [scienceRef, scienceActive] = useScrollReveal();
  const [featuresRef, featuresActive] = useScrollReveal();

  return (
    <div style={styles.page}>
      
      <nav style={styles.navbar}>
        <div style={styles.logoWrap} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={styles.logoIcon}>
            <img src="/logo.png" alt="LME" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={styles.logoName}>LME</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>
              Learner Modeling Engine
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button style={styles.navLink} className="nav-link" onClick={() => scrollTo('science')}>Research</button>
          <button style={styles.navLink} className="nav-link" onClick={() => scrollTo('features')}>Technology</button>
          <button style={styles.navPillBtn} className="btn-pill" onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </nav>

      <section style={styles.hero} ref={heroRef} className={`reveal ${heroActive ? 'active' : ''}`}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroHeadline}>
            Your Intelligent <br /> 
            AI Partner for <br />
            <span style={{ color: '#6366F1' }}>Maths & Logic.</span>
          </h1>
          <p style={styles.heroSub}>
            LME is a state-of-the-art behavioral modeling engine. Meet Leo, your person-like 
            learning agent that monitors struggle and provides real-time scaffolding.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button style={styles.ctaPillPrimary} className="btn-pill" onClick={() => navigate('/login')}>Meet Leo Now</button>
            <button style={styles.ctaPillSecondary} onClick={() => scrollTo('features')}>Explore Technology</button>
          </div>
        </div>
        
        <div style={styles.heroVisual}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={styles.avatarWrapper}>
              {/* The High-Res Male AI Agent ("Leo") */}
              <img src="/ai_logo.png" alt="Leo AI Agent" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            {/* Floating Badge (Now outside overflow:hidden wrapper) */}
            <div style={styles.badgeFloating}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22C55E' }} />
              <div style={{ fontSize: 16, fontWeight: 700 }}>Leo is Analyzing...</div>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.statsSection} ref={statsRef} className={`reveal ${statsActive ? 'active' : ''}`}>
        <div style={styles.statsGrid}>
          <div style={styles.statBox}>
            <div style={styles.statValue}>Real-Time</div>
            <div style={styles.statLabel}>Response</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>&lt;50ms</div>
            <div style={styles.statLabel}>Sync Latency</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statValue}>100%</div>
            <div style={styles.statLabel}>Transparent Logic</div>
          </div>
        </div>
      </section>

      {/* ── Research Section ── */}
      <section id="science" style={{ ...styles.section, background: '#F9FAFB' }} ref={scienceRef} className={`reveal ${scienceActive ? 'active' : ''}`}>
        <div style={styles.featurePill}>Pedagogical Foundation</div>
        <h2 style={styles.sectionTitle}>Validated by Research.</h2>
        <p style={styles.sectionDesc}>
          LME is rooted in cognitive load theory and the Zone of Proximal Development (ZPD). 
          Our behavioral engine bridges the gap between student independence and targeted mentorship.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 60, textAlign: 'left', maxWidth: 1100, margin: '0 auto' }}>
          <div className="card-hover" style={{ background: '#fff', padding: 40, borderRadius: 32, boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
            <h4 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#3D52A0' }}>Productive Failure</h4>
            <p style={{ color: '#4B5563', lineHeight: 1.6 }}>System-enforced requirements ensure students make an earnest initial attempt before hints are unlocked, building conceptual grit and long-term retention.</p>
          </div>
          <div className="card-hover" style={{ background: '#fff', padding: 40, borderRadius: 32, boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
            <h4 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#3D52A0' }}>Scaffolded Escalation</h4>
            <p style={{ color: '#4B5563', lineHeight: 1.6 }}>Pedagogical intent shifts dynamically from broad encouragement to specific conceptual hints as the length and nature of struggle increases.</p>
          </div>
          <div className="card-hover" style={{ background: '#fff', padding: 40, borderRadius: 32, boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
            <h4 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#3D52A0' }}>ZPD Precision</h4>
            <p style={{ color: '#4B5563', lineHeight: 1.6 }}>Rule-based behavioral classification ensures instructors are only alerted when a student is truly outside their zone of proximal development.</p>
          </div>
        </div>
      </section>

      <section id="features" style={styles.section} ref={featuresRef} className={`reveal ${featuresActive ? 'active' : ''}`}>
        <h2 style={styles.sectionTitle}>Built for Deep Insight.</h2>
        <p style={styles.sectionDesc}>
          LME transforms student interactions into a continuous pedagogical dialogue. 
        </p>
        <div style={styles.featureGrid}>
          <div className="card-hover" style={styles.featureCard}>
            <div style={styles.featurePill}>Observation</div>
            <h3 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Behavioral Analytics</h3>
            <p style={{ color: '#6B7280', lineHeight: 1.7 }}>
              Our telemetry monitors idle time and failed attempts to map the precise state of engagement.
            </p>
          </div>
          <div className="card-hover" style={styles.featureCard}>
            <div style={styles.featurePill}>Pedagogy</div>
            <h3 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Leo's Hint Engine</h3>
            <p style={{ color: '#6B7280', lineHeight: 1.7 }}>
              A multi-turn scaffolding system that provides escalating hints without ever revealing the answer.
            </p>
          </div>
          <div className="card-hover" style={styles.featureCard}>
            <div style={styles.featurePill}>Instruction</div>
            <h3 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Live Dashboard</h3>
            <p style={{ color: '#6B7280', lineHeight: 1.7 }}>
              An urgent feed for instructors that highlights students in need of intervention.
            </p>
          </div>
        </div>
      </section>

      <footer style={{ padding: '80px 8% 40px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="LME Logo" style={{ width: 60, height: 60, objectFit: 'contain' }} />
            <div style={{ fontSize: 20, fontWeight: 700 }}>LME</div>
          </div>
          <div style={{ fontSize: 14, color: '#6B7280' }}>
            © 2026 Learner Modeling Engine. Dedicated to Educational Innovation.
          </div>
        </div>
      </footer>
    </div>
  );
}
