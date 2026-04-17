import React, { useEffect, useState } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';

const COLORS = {
  engaged: '#2EC4B6',     // var(--primary-cyan)
  struggling: '#FF9F1C',  // var(--primary-orange)
  unengaged: '#E71D36',   // var(--primary-red)
  textMain: '#011627',
  textLight: '#64748b',
  border: '#e2e8f0',
  cardBg: '#ffffff'
};

export default function CohortView({ onSelectStudent }) {
  const { fetchCohort } = useAnalytics();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [classAverage, setClassAverage] = useState(null);

  useEffect(() => {
    async function loadData() {
      const result = await fetchCohort();
      if (result.error) setError(result.error);
      else {
        setData(result.data);
        
        // Calculate Class Average Baseline
        const students = result.data.students || [];
        if (students.length > 0) {
          const avg = {
            student_id: 'avg-baseline',
            student_name: 'CLASS AVG (Baseline)',
            engaged_ratio: students.reduce((a, b) => a + (b.engaged_ratio || 0), 0) / students.length,
            struggling_ratio: students.reduce((a, b) => a + (b.struggling_ratio || 0), 0) / students.length,
            unengaged_ratio: students.reduce((a, b) => a + (b.unengaged_ratio || 0), 0) / students.length
          };
          setClassAverage(avg);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [fetchCohort]);

  if (loading) return (
    <div style={{ padding: '4rem', textAlign: 'center' }}>
      <div className="loading-spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-cyan)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
      <p style={{ marginTop: '1rem', color: COLORS.textLight }}>Synthesizing cohort intelligence...</p>
    </div>
  );

  if (error) return (
    <div style={{ padding: '2rem', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#e11d48' }}>
      <strong>Analysis Error:</strong> {error}
    </div>
  );

  const rawStudents = data?.students || [];
  const filteredStudents = rawStudents.filter(s => 
    s.student_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Filtered results
  const chartData = filteredStudents;

  // 1. Mission Refactor: Dynamic Constraint Handling for High-Density Heatmaps
  let maxSessions = 5;
  filteredStudents.forEach(s => {
    s.sessions?.forEach(sess => {
      if (sess.session_index > maxSessions) maxSessions = sess.session_index;
    });
  });
  const sessionRange = Array.from({ length: maxSessions }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* GLOBAL COHORT SEARCH */}
      <div className="card" style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', background: COLORS.cardBg, display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '18px' }}>🔍</span>
        <input 
          type="text" 
          placeholder="Search students in this cohort (e.g. Adam)..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', fontWeight: '500' }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: COLORS.textLight, cursor: 'pointer', fontSize: '12px' }}>✕ Clear</button>
        )}
      </div>

      {/* SECTION 1: CLASS DISTRIBUTION */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: COLORS.cardBg, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: COLORS.textMain }}>Class-wide Engagement Distribution</h3>
        <p style={{ margin: '0.2rem 0 1.5rem 0', fontSize: '12px', color: COLORS.textLight }}>
          Comparison of lifelong engagement across the entire cohort
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* PART A: CLASS SUMMARY BAR */}
          {classAverage && (
            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: COLORS.textLight, marginBottom: '0.8rem', letterSpacing: '0.5px' }}>COHORT AVERAGE BASELINE</div>
              <div style={{ height: '24px', display: 'flex', borderRadius: '6px', overflow: 'hidden', marginBottom: '1rem' }}>
                <div style={{ width: `${classAverage.engaged_ratio * 100}%`, background: COLORS.engaged, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                  {Math.round(classAverage.engaged_ratio * 100)}%
                </div>
                <div style={{ width: `${classAverage.struggling_ratio * 100}%`, background: COLORS.struggling, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                  {Math.round(classAverage.struggling_ratio * 100)}%
                </div>
                <div style={{ width: `${classAverage.unengaged_ratio * 100}%`, background: COLORS.unengaged, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                  {Math.round(classAverage.unengaged_ratio * 100)}%
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: COLORS.engaged }}>● {Math.round(classAverage.engaged_ratio * 100)}% Engaged</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: COLORS.struggling }}>● {Math.round(classAverage.struggling_ratio * 100)}% Struggling</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: COLORS.unengaged }}>● {Math.round(classAverage.unengaged_ratio * 100)}% Unengaged</div>
              </div>
            </div>
          )}

          {/* PART B: COMPACT STUDENT GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {filteredStudents
              .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
              .map(student => (
                <div 
                  key={student.student_id} 
                  className="student-card"
                  title={`${student.student_name}\nEngaged: ${Math.round(student.engaged_ratio * 100)}%\nStruggling: ${Math.round(student.struggling_ratio * 100)}%\nUnengaged: ${Math.round(student.unengaged_ratio * 100)}%`}
                  style={{ 
                    padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white',
                    display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease'
                  }}
                  onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'}
                  onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
                  onClick={() => onSelectStudent(student.student_id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: COLORS.textMain }}>
                      {student.student_name.length > 15 ? student.student_name.substring(0, 15) + '...' : student.student_name}
                    </div>
                    <div style={{ 
                      fontSize: '9px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px',
                      background: student.risk_label === 'high' ? '#fff1f2' : (student.risk_label === 'medium' ? '#fffbeb' : '#f0fdfa'),
                      color: student.risk_label === 'high' ? COLORS.unengaged : (student.risk_label === 'medium' ? COLORS.struggling : COLORS.engaged),
                      textTransform: 'uppercase'
                    }}>
                      {student.risk_label}
                    </div>
                  </div>
                  <div style={{ height: '8px', display: 'flex', borderRadius: '4px', overflow: 'hidden', background: '#f1f5f9' }}>
                    <div style={{ width: `${(student.engaged_ratio || 0) * 100}%`, background: COLORS.engaged }} />
                    <div style={{ width: `${(student.struggling_ratio || 0) * 100}%`, background: COLORS.struggling }} />
                    <div style={{ width: `${(student.unengaged_ratio || 0) * 100}%`, background: COLORS.unengaged }} />
                  </div>
                </div>
              ))}
          </div>
          {filteredStudents.length === 0 && (
            <div style={{ textAlign: 'center', color: COLORS.textLight, padding: '2rem' }}>No matching students found</div>
          )}
        </div>
      </div>

      {/* SECTION 2: HEATMAP */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: COLORS.cardBg, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: COLORS.textMain }}>Session Engagement Heatmap</h3>
        <p style={{ margin: '0.2rem 0 1.5rem 0', fontSize: '12px', color: COLORS.textLight }}>
          Sticky headers enabled for infinite class scrolling
        </p>

        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '8px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: COLORS.cardBg }}>
              <tr>
                <th style={{ textAlign: 'left', fontSize: '12px', color: COLORS.textLight, paddingBottom: '8px', background: COLORS.cardBg }}>Student Name</th>
                {sessionRange.map(idx => (
                  <th key={`head-${idx}`} style={{ fontSize: '12px', color: COLORS.textLight, width: '48px', paddingBottom: '8px', background: COLORS.cardBg }}>S{idx}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <tr key={student.student_id} className="heatmap-row">
                  <td style={{ fontSize: '13.5px', fontWeight: '600', color: COLORS.textMain }}>{student.student_name}</td>
                  {sessionRange.map(idx => {
                    const session = student.sessions?.find(s => s.session_index === idx);
                    let bgColor = '#f1f5f9'; // Missing
                    let content = '—';
                    let stateName = 'No Data';
                    
                    if (session) {
                      const val = Number(session.avg_SI ?? 0);
                      content = (Math.abs(val) < 0.005 ? 0 : val).toFixed(2);
                      stateName = session.dominant_state;
                      if (session.dominant_state === 'Engaged') bgColor = COLORS.engaged;
                      else if (session.dominant_state === 'Struggling') bgColor = COLORS.struggling;
                      else if (session.dominant_state === 'Unengaged') bgColor = COLORS.unengaged;
                    }

                    return (
                      <td key={idx} style={{ padding: 0 }}>
                        <div 
                          title={`${stateName} | SI: ${(session?.avg_SI ?? 0).toFixed(3)}`}
                          style={{
                            width: '48px', height: '48px', borderRadius: '6px', backgroundColor: session ? bgColor : '#f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px',
                            fontWeight: '700', color: session ? 'white' : COLORS.textLight, cursor: 'pointer',
                            transition: 'transform 0.2s ease'
                          }}
                          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                          onClick={() => onSelectStudent(student.student_id)}
                        >
                          {content}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: COLORS.textLight, fontSize: '14px', fontStyle: 'italic' }}>
              Data Synced: 0 Rows Found
            </div>
          )}
        </div>

        {/* HEATMAP LEGEND & INSIGHT GUIDE */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '1rem', color: COLORS.textMain }}>Discovery Guide</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: COLORS.textLight }}>
                <span style={{ fontWeight: '800', color: COLORS.engaged, minWidth: '80px' }}>Horizontal Row:</span>
                <span>Shows a <strong>Student's consistency</strong>. Look for "Red-to-Green" patterns to see recovery.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: COLORS.textLight }}>
                <span style={{ fontWeight: '800', color: COLORS.unengaged, minWidth: '80px' }}>Vertical Column:</span>
                <span>Shows <strong>Session Difficulty</strong>. If a column is red for everyone, it indicates a class-wide "Mastery Gap."</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: COLORS.textLight }}>
                <span style={{ fontWeight: '800', color: COLORS.struggling, minWidth: '80px' }}>Cell Numbers:</span>
                <span>The <strong>Struggle Index (SI)</strong>. Scores > 0.50 indicate high friction or frustration.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: MOST STRUGGLED QUESTIONS */}
      <div className="card" style={{ padding: '1.5rem', borderRadius: '12px', background: COLORS.cardBg, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: COLORS.textMain }}>Most Struggled Questions</h3>
        <p style={{ margin: '0.2rem 0 1.5rem 0', fontSize: '12px', color: COLORS.textLight }}>
          Ranked by average Struggle Index across all students
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(data?.most_struggled_questions || []).slice(0, 5).map((item, idx) => {
            const si = item.avg_SI;
            let barColor = COLORS.engaged;
            if (si > 0.6) barColor = COLORS.unengaged;
            else if (si >= 0.4) barColor = COLORS.struggling;

            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '12px', fontWeight: '800', minWidth: '15px', color: COLORS.textLight }}>{idx + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.question_text}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(10, si * 100)}%`, height: '100%', background: barColor }}></div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: barColor }}>{(si ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
