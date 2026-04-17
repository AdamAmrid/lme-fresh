import React, { useEffect, useState } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';

const COLORS = {
  low: '#2EC4B6',      // Green
  medium: '#FF9F1C',   // Amber
  high: '#E71D36',     // Red
  textMain: '#011627',
  textLight: '#64748b',
  border: '#e2e8f0',
  cardBg: '#ffffff',
  accent: '#2EC4B6'
};

export default function PredictiveView() {
  const { fetchRisk } = useAnalytics();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRawFeatures, setShowRawFeatures] = useState(false);

  useEffect(() => {
    async function loadData() {
      const result = await fetchRisk();
      if (result.error) setError(result.error);
      else setData(result.data);
      setLoading(false);
    }
    loadData();
  }, [fetchRisk]);

  if (loading) return (
    <div style={{ padding: '4rem', textAlign: 'center' }}>
      <div className="loading-spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-cyan)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
      <p style={{ marginTop: '1rem', color: COLORS.textLight }}>Calculating future performance trajectories...</p>
    </div>
  );

  if (error) return (
    <div style={{ padding: '2rem', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#e11d48' }}>
      <strong>Risk Calculation Error:</strong> {error}
    </div>
  );

  const students = data?.students || [];
  const highRiskStudents = students.filter(s => s.risk_label === 'high');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* SECTION 1: EARLY WARNING BANNER */}
      {highRiskStudents.length > 0 ? (
        <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#fff1f2', borderLeft: `6px solid ${COLORS.high}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: COLORS.high, display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠ Early Warning — Students Requiring Attention
          </h3>
          <ul style={{ margin: '1rem 0 0 0', paddingLeft: '1.5rem', color: COLORS.textMain, fontSize: '14px' }}>
            {highRiskStudents.map((s, idx) => (
              <li key={idx} style={{ marginBottom: '0.5rem' }}>
                <strong>{s.student_name}</strong>: <span style={{ fontStyle: 'italic' }}>{s.suggested_intervention}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#f0fdf4', borderLeft: `6px solid ${COLORS.low}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#166534' }}>
            All students are currently within acceptable engagement thresholds
          </h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '13px', color: '#166534' }}>No immediate interventions required based on current patterns.</p>
        </div>
      )}

      {/* SECTION 2: MODEL TRANSPARENCY NOTE */}
      <div style={{ padding: '1.2rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
        <p style={{ margin: 0, fontSize: '12px', color: COLORS.textLight, fontWeight: '700' }}>
          Risk predictions powered by: <span style={{ color: COLORS.accent }}>{data?.model_mode || 'Rule-based formula'}</span>
        </p>
        <p style={{ margin: '0.3rem 0 0 0', fontSize: '11px', color: COLORS.textLight }}>
          Features: Avg Struggle Index · Hint Dependency · Unengaged Ratio · Avg Attempt Count · Session Count
        </p>
      </div>

      {/* SECTION 3: RISK SCORE CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {students.sort((a, b) => b.risk_score - a.risk_score).map((student, idx) => {
          const labelColor = COLORS[student.risk_label] || COLORS.low;
          
          // Derived Trend Note
          let trendNote = "Engagement within acceptable range";
          const f = student.features || {};
          if (f.avg_SI > 0.6) trendNote = "Struggle Index critically elevated";
          else if (f.hint_dependency_score > 0.5) trendNote = "High hint dependency detected";
          else if (f.unengaged_ratio > 0.4) trendNote = "Frequent disengagement observed";

          return (
            <div key={idx} className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: COLORS.cardBg, borderLeft: `4px solid ${labelColor}`, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: '600', color: COLORS.textMain }}>{student.student_name}</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', background: `${labelColor}15`, color: labelColor, textTransform: 'uppercase' }}>
                  {student.risk_label}
                </span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textLight }}>RISK SCORE</span>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: labelColor }}>{(student.risk_score ?? 0).toFixed(2)}</span>
                </div>
                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${student.risk_score * 100}%`, height: '100%', background: labelColor }}></div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ padding: '4px 10px', borderRadius: '20px', background: '#f1f5f9', color: COLORS.textLight, fontSize: '11px', fontWeight: '600' }}>
                  {student.dominant_weakness}
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '11px', color: COLORS.textLight, fontStyle: 'italic', flex: 1 }}>
                {student.suggested_intervention}
              </p>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', fontSize: '10px', color: labelColor, fontWeight: '700' }}>
                Note: {trendNote}
              </div>
            </div>
          );
        })}
      </div>

      {/* SECTION 4: FEATURE TRANSPARENCY TABLE */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: COLORS.cardBg, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <button 
          onClick={() => setShowRawFeatures(!showRawFeatures)}
          style={{ background: 'transparent', border: '1px solid var(--primary-cyan)', color: 'var(--primary-cyan)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', transition: '0.2s' }}
          onMouseOver={e => {e.currentTarget.style.background = 'var(--secondary-cyan)'}}
          onMouseOut={e => {e.currentTarget.style.background = 'transparent'}}
        >
          {showRawFeatures ? 'Hide raw feature data' : 'Show raw feature data'}
        </button>

        {showRawFeatures && (
          <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Student Name</th>
                  <th style={{ padding: '10px' }}>Avg SI</th>
                  <th style={{ padding: '10px' }}>Hint Dep.</th>
                  <th style={{ padding: '10px' }}>Unengaged %</th>
                  <th style={{ padding: '10px' }}>Attempts</th>
                  <th style={{ padding: '10px' }}>Sessions</th>
                  <th style={{ padding: '10px', fontWeight: '800' }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const f = s.features || {};
                  const isSiBad = f.avg_SI > 0.6;
                  const isHintBad = f.hint_dependency_score > 0.5;
                  const isUnBad = f.unengaged_ratio > 0.4;
                  const isAttBad = f.avg_attempt_count > 3;

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', fontWeight: '600' }}>{s.student_name}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: isSiBad ? COLORS.high : 'inherit', fontWeight: isSiBad ? '800' : '400' }}>{(f.avg_SI ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: isHintBad ? COLORS.high : 'inherit', fontWeight: isHintBad ? '800' : '400' }}>{(f.hint_dependency_score ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: isUnBad ? COLORS.high : 'inherit', fontWeight: isUnBad ? '800' : '400' }}>{((f.unengaged_ratio ?? 0) * 100).toFixed(0)}%</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: isAttBad ? COLORS.high : 'inherit', fontWeight: isAttBad ? '800' : '400' }}>{(f.avg_attempt_count ?? 0).toFixed(1)}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>{f.session_count || 0}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '800', color: COLORS[s.risk_label] || COLORS.low }}>{(s.risk_score ?? 0).toFixed(2)}</td>
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
