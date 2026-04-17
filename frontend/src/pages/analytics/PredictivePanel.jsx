import React, { useEffect, useState } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { FiAlertCircle, FiCheckCircle, FiUsers, FiActivity, FiArrowRight } from 'react-icons/fi';

const COLORS = {
  high: '#E71D36',     // Red
  medium: '#FF9F1C',   // Amber
  low: '#2EC4B6',      // Teal
  textMain: '#011627',
  textLight: '#64748b',
  border: '#e2e8f0',
  cardBg: '#ffffff',
  accent: '#2EC4B6'
};

const StatCard = ({ title, count, color, subtitle, icon: Icon }) => (
  <div style={{ flex: 1, padding: '1.2rem', background: 'white', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `rgba(${color === COLORS.high ? '231,29,54' : (color === COLORS.medium ? '255,159,28' : '46,196,182')}, 0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
      <Icon size={20} />
    </div>
    <div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: COLORS.textMain }}>{count}</div>
      <div style={{ fontSize: '11px', fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
    </div>
  </div>
);

const RiskCard = ({ student, onSelect, history }) => {
  const isHigh = student.risk_label === 'high';
  
  // Logic to find Primary Trigger
  const f = student.features || {};
  let trigger = "Baseline Pattern";
  if (f.avg_SI > 0.35) trigger = `High struggle (SI: ${f.avg_SI.toFixed(2)})`;
  else if (f.hint_dependency_score > 0.6) trigger = "Heavy hint dependency";
  else if (f.avg_idle_time > 120) trigger = "Prolonged stall (> 2m)";
  else if (f.unengaged_ratio > 0.3) trigger = "Significant unengagement";

  return (
    <div 
      className="interaction-card"
      style={{ 
        background: 'white', padding: '1.2rem', borderRadius: '12px', border: '1px solid #f1f5f9', cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden'
      }}
      onMouseOver={e => {
        e.currentTarget.style.transform = 'translateY(-6px)';
        e.currentTarget.style.boxShadow = '0 12px 20px -8px rgba(0,0,0,0.1)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: COLORS.textMain, marginBottom: '2px' }}>{student.student_name}</div>
          <div style={{ fontSize: '10px', color: COLORS.textLight, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: isHigh ? COLORS.high : COLORS.medium }}>●</span> {trigger}
          </div>
        </div>
        <div style={{ padding: '3px 8px', borderRadius: '4px', background: isHigh ? '#fff1f2' : '#fffbeb', color: isHigh ? COLORS.high : COLORS.medium, fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }}>
          {student.risk_label}
        </div>
      </div>

      <div style={{ height: '40px', marginBottom: '1.2rem', width: '100%', opacity: 0.8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history?.length > 0 ? history : [{avg_SI:0.1},{avg_SI:0.12},{avg_SI:0.08}]}>
            <defs>
              <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isHigh ? COLORS.high : COLORS.medium} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isHigh ? COLORS.high : COLORS.medium} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="avg_SI" stroke={isHigh ? COLORS.high : COLORS.medium} strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" isAnimationActive={false} />
            <YAxis hide domain={[0, 1]} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <button 
        onClick={() => onSelect(student.student_id)}
        style={{ 
          width: '100%', padding: '0.6rem', background: 'transparent', border: '1.5px solid #e2e8f0', color: COLORS.textMain,
          borderRadius: '8px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', transition: '0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
        }}
        onMouseOver={e => {
          e.currentTarget.style.borderColor = COLORS.accent;
          e.currentTarget.style.color = COLORS.accent;
        }}
        onMouseOut={e => {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.color = COLORS.textMain;
        }}
      >
        Intervene <FiArrowRight size={14} />
      </button>
    </div>
  );
};

export default function PredictivePanel({ onSelectStudent }) {
  const { fetchRisk, fetchCohort } = useAnalytics();
  const [predictiveData, setPredictiveData] = useState(null);
  const [cohortData, setCohortData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRawFeatures, setShowRawFeatures] = useState(false);
  const [contactedStatus, setContactedStatus] = useState({});

  useEffect(() => {
    async function loadAll() {
      try {
        const [riskRes, cohortRes] = await Promise.all([fetchRisk(), fetchCohort()]);
        if (riskRes.error) throw new Error(riskRes.error);
        if (cohortRes.error) throw new Error(cohortRes.error);
        
        setPredictiveData(riskRes.data);
        setCohortData(cohortRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [fetchRisk, fetchCohort]);

  const toggleContacted = (id) => {
    setContactedStatus(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getRiskColor = (risk) => {
    if (risk > 0.70) return COLORS.high;
    if (risk > 0.40) return COLORS.medium;
    return COLORS.low;
  };

  if (loading) return (
    <div style={{ padding: '4rem', textAlign: 'center' }}>
      <div className="loading-spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-cyan)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
      <p style={{ marginTop: '1rem', color: COLORS.textLight }}>Booting ML risk engine...</p>
    </div>
  );

  if (error) return (
    <div style={{ padding: '2rem', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#e11d48' }}>
      <strong>Predictive API Error:</strong> {error}
    </div>
  );

  const students = predictiveData?.predictions || [];
  const activeRisks = students.filter(s => s.risk_label !== 'low'); 
  const highRiskStudents = students.filter(s => s.risk_score > 0.7);

  // Intervention Column Filtering
  const emotional = activeRisks.filter(s => s.dominant_weakness === 'emotional').sort((a,b) => b.risk_score - a.risk_score);
  const behavioral = activeRisks.filter(s => s.dominant_weakness === 'behavioral').sort((a,b) => b.risk_score - a.risk_score);
  const cognitive = activeRisks.filter(s => s.dominant_weakness === 'cognitive').sort((a,b) => b.risk_score - a.risk_score);

  // Map of studentId -> last 5 session SI values
  const studentHistory = (cohortData?.students || []).reduce((acc, s) => {
    acc[s.student_id] = (s.sessions || []).slice(-5).map(sess => ({ avg_SI: sess.avg_SI }));
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* SECTION 0: TOP STAT CARDS */}
      <div style={{ display: 'flex', gap: '1.2rem' }}>
        <StatCard title="Emotional Risk" count={emotional.length} color={COLORS.high} icon={FiAlertCircle} />
        <StatCard title="Behavioral Risk" count={behavioral.length} color={COLORS.medium} icon={FiActivity} />
        <StatCard title="Cognitive Risk" count={cognitive.length} color={COLORS.accent} icon={FiUsers} />
      </div>

      {/* SECTION 1: EARLY WARNING BANNER */}
      {highRiskStudents.length > 0 ? (
        <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#fff1f2', borderLeft: `6px solid ${COLORS.high}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: COLORS.high, display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠ Attention Required — {highRiskStudents.length} Students Flagged
          </h3>
          <p style={{ margin: '0.5rem 0 1.2rem 0', fontSize: '13px', color: COLORS.textMain }}>High-risk patterns detected. Use the checklist to track your outreach:</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {highRiskStudents.map((s, idx) => {
              const studentId = s.student_id;
              const isContacted = contactedStatus[studentId];
              return (
                <div 
                  key={idx} 
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem', borderRadius: '8px',
                    background: isContacted ? '#f0fdf4' : 'rgba(255,255,255,0.5)',
                    border: isContacted ? '1px solid #bbf7d0' : '1px solid transparent',
                    transition: '0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input 
                      type="checkbox" 
                      checked={!!isContacted} 
                      onChange={() => toggleContacted(studentId)}
                      id={`check-${studentId}`}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <label 
                      htmlFor={`check-${studentId}`}
                      style={{ 
                        fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                        textDecoration: isContacted ? 'line-through' : 'none',
                        color: isContacted ? '#166534' : COLORS.textMain,
                        opacity: isContacted ? 0.6 : 1
                      }}
                    >
                      {s.student_name}
                    </label>
                  </div>
                  <div style={{ fontSize: '11px', color: isContacted ? '#166534' : COLORS.textLight, fontStyle: 'italic' }}>
                    {s.suggested_intervention}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#f0fdf4', borderLeft: `6px solid ${COLORS.low}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiCheckCircle /> Intelligence engine reports stable patterns
          </h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '13px', color: '#166534' }}>All students are currently within acceptable engagement thresholds.</p>
        </div>
      )}

      {/* SECTION 2: INTERVENTION KANBAN BOARD */}
      <div>
        <h3 style={{ margin: '0 0 1.2rem 0', fontSize: '1.1rem', fontWeight: '800', color: COLORS.textMain }}>Intervention Priority Kanban</h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
          gap: '20px' 
        }}>
          {/* EMOTIONAL COLUMN */}
          <div style={{ minHeight: '300px', background: 'rgba(231, 29, 54, 0.04)', backdropFilter: 'blur(10px)', borderRadius: '16px', borderTop: `4px solid ${COLORS.high}`, border: '1px solid rgba(231, 29, 54, 0.1)', padding: '1.5rem' }}>
            <h4 style={{ margin: 0, color: COLORS.high, fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>Emotional</h4>
            <div style={{ fontSize: '11px', color: COLORS.textLight, marginBottom: '1.5rem' }}>Frustration · Disengagement</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {emotional.length > 0 ? emotional.map(s => (
                <RiskCard key={s.student_id} student={s} onSelect={onSelectStudent} history={studentHistory[s.student_id]} />
              )) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#166534' }}>
                  <FiCheckCircle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>All Clear</div>
                </div>
              )}
            </div>
          </div>

          {/* BEHAVIORAL COLUMN */}
          <div style={{ minHeight: '300px', background: 'rgba(255, 159, 28, 0.04)', backdropFilter: 'blur(10px)', borderRadius: '16px', borderTop: `4px solid ${COLORS.medium}`, border: '1px solid rgba(255, 159, 28, 0.1)', padding: '1.5rem' }}>
            <h4 style={{ margin: 0, color: COLORS.medium, fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>Behavioral</h4>
            <div style={{ fontSize: '11px', color: COLORS.textLight, marginBottom: '1.5rem' }}>Idle time · Participation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {behavioral.length > 0 ? behavioral.map(s => (
                <RiskCard key={s.student_id} student={s} onSelect={onSelectStudent} history={studentHistory[s.student_id]} />
              )) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#166534' }}>
                  <FiCheckCircle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>All Clear</div>
                </div>
              )}
            </div>
          </div>

          {/* COGNITIVE COLUMN */}
          <div style={{ minHeight: '300px', background: 'rgba(46, 196, 182, 0.04)', backdropFilter: 'blur(10px)', borderRadius: '16px', borderTop: `4px solid ${COLORS.accent}`, border: '1px solid rgba(46, 196, 182, 0.1)', padding: '1.5rem' }}>
            <h4 style={{ margin: 0, color: COLORS.accent, fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>Cognitive</h4>
            <div style={{ fontSize: '11px', color: COLORS.textLight, marginBottom: '1.5rem' }}>Hints · Knowledge Gaps</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cognitive.length > 0 ? cognitive.map(s => (
                <RiskCard key={s.student_id} student={s} onSelect={onSelectStudent} history={studentHistory[s.student_id]} />
              )) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#166534' }}>
                  <FiCheckCircle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>All Clear</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: MODEL TRANSPARENCY NOTE */}
      <div style={{ padding: '1.2rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
        <p style={{ margin: 0, fontSize: '12px', color: COLORS.textLight, fontWeight: '700' }}>
          Risk predictions powered by: <span style={{ color: COLORS.accent }}>{predictiveData?.model_mode || 'ML Engine'}</span>
        </p>
        <p style={{ margin: '0.3rem 0 0 0', fontSize: '11px', color: COLORS.textLight }}>
          Feature Weights: Avg SI (30%) · Hint Dep (30%) · Unengaged (20%) · Participation Gap (20%)
        </p>
      </div>

      {/* SECTION 4: RAW FEATURE AUDIT TABLE */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: COLORS.cardBg, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
           <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: COLORS.textMain }}>Raw Feature Data Table</h3>
           <button 
            onClick={() => setShowRawFeatures(!showRawFeatures)}
            style={{ background: 'transparent', border: `1px solid ${COLORS.accent}`, color: COLORS.accent, padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
          >
            {showRawFeatures ? 'Hide features' : 'Show features'}
          </button>
        </div>

        {showRawFeatures && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 10px' }}>STUDENT NAME</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>AVG SI</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>HINT DEP.</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>UNENGAGED %</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>ATTEMPTS</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>SESSIONS</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '800' }}>RISK %</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const f = s.features || {};
                  const riskScore = s.risk_score || 0;
                  const riskColor = getRiskColor(riskScore);
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: '0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '15px 10px', fontWeight: '700', color: COLORS.textMain }}>{s.student_name}</td>
                      <td style={{ padding: '15px 10px', textAlign: 'center' }}>{(f.avg_SI ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '15px 10px', textAlign: 'center' }}>{(f.hint_dependency_score ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '15px 10px', textAlign: 'center' }}>{((f.unengaged_ratio ?? 0) * 100).toFixed(0)}%</td>
                      <td style={{ padding: '15px 10px', textAlign: 'center' }}>{(f.avg_attempt_count ?? 0).toFixed(1)}</td>
                      <td style={{ padding: '15px 10px', textAlign: 'center' }}>{f.session_count || 0}</td>
                      <td style={{ padding: '15px 10px', textAlign: 'center', fontWeight: '900', color: riskColor }}>
                        {(riskScore * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
