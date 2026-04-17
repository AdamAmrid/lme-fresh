import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, ReferenceLine, Cell } from 'recharts';

const COLORS = {
  primaryCyan: '#10b981', // Emerald
  primaryOrange: '#f59e0b', // Amber
  primaryRed: '#f43f5e', // Rose
  muted: '#64748b',
  bgHover: '#f1f5f9',
  border: '#e2e8f0',
  cardBg: '#ffffff',
  textDark: '#0f172a',
  insightBg: '#F0F9FF'
};

const getStateColor = (state) => {
  if (state === 'Engaged') return COLORS.primaryCyan;
  if (state === 'Struggling') return COLORS.primaryOrange;
  if (state === 'Unengaged') return COLORS.primaryRed;
  return COLORS.muted;
};

const getSIColor = (val) => {
  if (val < 0.30) return COLORS.primaryCyan;
  if (val < 0.50) return COLORS.primaryOrange;
  return COLORS.primaryRed;
};

const getMasteryColor = (val) => {
  if (val > 0.70) return COLORS.primaryCyan;
  if (val > 0.45) return COLORS.primaryOrange;
  return COLORS.primaryRed;
};

const getChartDomain = (data) => {
  if (!data || data.length === 0) return [0, 1];
  const minVal = Math.max(0, Math.min(...data) - 0.05);
  const maxVal = Math.min(1, Math.max(...data) + 0.05);
  // Ensure a minimum spread to prevent jitter
  if (maxVal - minVal < 0.2) return [Math.max(0, minVal - 0.1), Math.min(1, maxVal + 0.1)];
  return [minVal, maxVal];
};

const getRiskColor = (label) => {
  if (label === 'low') return COLORS.primaryCyan;
  if (label === 'medium') return COLORS.primaryOrange;
  return COLORS.primaryRed;
};

const RiskBadge = ({ label }) => {
  const bg = getRiskColor(label?.toLowerCase());
  return (
    <span style={{
      background: bg, color: 'white', borderRadius: '6px', padding: '3px 10px',
      fontSize: '10px', fontWeight: '800', textTransform: 'uppercase',
      letterSpacing: '0.5px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      {label}
    </span>
  );
};

export default function LearnerProfileView({ selectedStudentId, setSelectedStudentId }) {
  const { fetchCohort, fetchStudent } = useAnalytics();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [profileData, setProfileData] = useState(null);
  
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(null);

  const [activeTab, setActiveTab] = useState('cognitive');
  const [isListOpen, setIsListOpen] = useState(true);

  // Collapsible state
  const [collapsed, setCollapsed] = useState({
    cog_mastery: false,
    cog_struggle: false,
    cog_hint: false,
    beh_metrics: false,
    emo_state: false,
    emo_resilience: false,
    hist_timeline: false,
    hist_table: true
  });

  const loadCohort = useCallback(async () => {
    const { data, error } = await fetchCohort();
    if (!error && data && data.students) {
      setStudents(data.students);
      setFilteredStudents(data.students);
    }
  }, [fetchCohort]);

  const loadProfile = useCallback(async (id, silent = false) => {
    if (!silent) setLoadingProfile(true);
    else setIsRefetching(true);

    const { data, error } = await fetchStudent(id);
    if (!error) {
      console.log(`[API Debug] GET /student/${id} returned raw risk object:`, data.risk);
      setProfileData(data);
      if (!silent) {
        setCollapsed({
          cog_mastery: false,
          cog_struggle: false,
          cog_hint: false,
          beh_metrics: false,
          emo_state: false,
          emo_resilience: false,
          hist_timeline: false,
          hist_table: true
        });
      }
    }
    setLoadingProfile(false);
    setIsRefetching(false);
  }, [fetchStudent]);

  useEffect(() => { loadCohort(); }, [loadCohort]);

  useEffect(() => {
    if (selectedStudentId) {
      loadProfile(selectedStudentId);
    }
  }, [selectedStudentId, loadProfile]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredStudents(students.filter(s => s.student_name.toLowerCase().includes(searchTerm.toLowerCase())));
    } else {
      setFilteredStudents(students);
    }
  }, [searchTerm, students]);

  const intelligentNote = useMemo(() => {
    if (!profileData) return "Insight: Session performance within normal learning parameters";
    
    const siTrend = profileData.cognitive.si_trend || [];
    const masteryTraj = profileData.cognitive.mastery_trajectory || [];
    if (siTrend.length === 0 || masteryTraj.length === 0) return "Insight: Session performance within normal learning parameters";
    
    const lastSI = siTrend[siTrend.length - 1];
    const firstSI = siTrend[0];
    const lastM = masteryTraj[masteryTraj.length - 1];
    const firstM = masteryTraj[0];
    const hintDep = profileData.cognitive.avg_hint_level_used;
    const unengaged = profileData.emotional.unengaged_ratio;
    const recovery = profileData.emotional.recovery_events;

    // Fix 4: Tightened trigger conditions
    if (lastSI > firstSI + 0.15 && lastM < firstM - 0.10) {
      return "Insight: Struggle significantly worsening and mastery declining — immediate attention recommended";
    }
    if (lastSI < firstSI - 0.15) {
      return "Insight: Struggle Index improving across sessions — student is recovering well";
    }
    if (hintDep > 0.6 && lastM > 0.65) {
      return "Insight: High hint usage but strong mastery — consider gradually fading scaffolding";
    }
    if (unengaged > 0.35) {
      return "Insight: Significant disengagement detected — motivational intervention suggested";
    }
    if (recovery >= 3) {
      return "Insight: Strong resilience pattern — student consistently self-corrects";
    }
    return "Insight: Session performance within normal learning parameters";
  }, [profileData]);

  const getLifetimeState = () => {
    if (!profileData) return 'Unknown';
    const { engaged_ratio, struggling_ratio, unengaged_ratio } = profileData.emotional;
    if (engaged_ratio >= struggling_ratio && engaged_ratio >= unengaged_ratio) return 'Engaged';
    if (struggling_ratio >= engaged_ratio && struggling_ratio >= unengaged_ratio) return 'Struggling';
    return 'Unengaged';
  };

  const CollapsibleSection = ({ id, title, subtitle, children }) => {
    const isCollapsed = collapsed[id];
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div 
          onClick={() => setCollapsed(prev => ({ ...prev, [id]: !isCollapsed }))}
          style={{ 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            cursor: 'pointer', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '0.4rem', marginBottom: '0.5rem'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: COLORS.muted }}>
            {title}
          </div>
          <div style={{ fontSize: '12px', color: COLORS.muted }}>
            {isCollapsed ? '▶' : '▼'}
          </div>
        </div>
        
        {subtitle && (
          <div style={{ fontSize: '11px', color: COLORS.muted, fontStyle: 'italic', marginBottom: '0.8rem' }}>
            {subtitle}
          </div>
        )}
        
        <div style={{
          maxHeight: isCollapsed ? '0px' : '2000px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
        }}>
          <div style={{ paddingBottom: '0.5rem' }}>
            {children}
          </div>
        </div>
      </div>
    );
  };

  const TabButton = ({ id, label }) => (
    <button 
      onClick={() => setActiveTab(id)}
      style={{
        padding: '0.6rem 1.5rem',
        border: 'none',
        background: activeTab === id ? COLORS.primaryCyan : 'transparent',
        color: activeTab === id ? 'white' : COLORS.muted,
        fontWeight: activeTab === id ? '600' : '400',
        borderRadius: '6px 6px 0 0',
        cursor: 'pointer',
        fontSize: '13px',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (activeTab !== id) e.currentTarget.style.background = '#2EC4B615';
      }}
      onMouseLeave={(e) => {
        if (activeTab !== id) e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', padding: '1rem', background: '#f8fafc' }}>
      <style>{`
        @keyframes pulse-teal { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .session-table th { text-align: left; padding: 8px; border-bottom: 2px solid ${COLORS.border}; font-size: 12px; color: ${COLORS.muted}; }
        .session-table td { padding: 8px; border-bottom: 1px solid ${COLORS.border}; font-size: 13px; }
      `}</style>
      
      {/* Search Sidebar */}
      <div 
        className="card" 
        style={{ 
          flex: isListOpen ? '0 0 320px' : '0 0 50px', 
          display: 'flex', flexDirection: 'column', padding: isListOpen ? '1.2rem' : '1.2rem 0.5rem',
          transition: 'all 0.3s ease', overflow: 'hidden',
          position: 'sticky', top: '1rem', height: 'calc(100vh - 140px)'
        }}
      >
        {isListOpen ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                placeholder="Search student..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1, padding: '0.7rem 1rem', minWidth: 0, borderRadius: '8px', border: `1px solid ${COLORS.border}`, fontSize: '14px' }}
              />
              <button 
                onClick={() => setIsListOpen(false)} 
                title="Collapse List"
                style={{ flex: 'none', padding: '0.7rem 0.6rem', border: `1px solid ${COLORS.border}`, borderRadius: '8px', background: 'transparent', cursor: 'pointer', color: COLORS.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                ◀
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredStudents.map(s => {
                return (
                <div 
                  key={s.student_id} 
                  onClick={() => { setSelectedStudentId(s.student_id); loadProfile(s.student_id); }}
                  style={{ 
                    padding: '0.8rem 1rem', borderRadius: '10px', cursor: 'pointer',
                    background: selectedStudentId === s.student_id ? COLORS.bgHover : 'transparent',
                    marginBottom: '0.5rem', display: 'flex', alignItems: 'center', transition: 'all 0.2s'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.textDark }}>{s.student_name}</div>
                    <div style={{ fontSize: '11px', color: COLORS.muted }}>{s.dominant_state}</div>
                  </div>
                </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
            <button 
              onClick={() => setIsListOpen(true)} 
              title="Expand List"
              style={{ width: '100%', padding: '0.8rem 0', border: `1px solid ${COLORS.border}`, borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', color: COLORS.textDark, fontWeight: 'bold' }}
              onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
              onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}
            >
              ▶
            </button>
            <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', color: COLORS.muted, letterSpacing: '2px', fontWeight: 'bold', marginTop: '2rem', fontSize: '12px' }}>
              STUDENTS
            </div>
          </div>
        )}
      </div>

      {/* Diagnostic View */}
      <div className="profile-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!selectedStudentId ? (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, padding: '3rem' }}>
            Select a student to begin diagnostic
          </div>
        ) : loadingProfile ? (
          <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted }}>
            Calibrating analytics...
          </div>
        ) : profileData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
            
            {/* CLEAN HEADER */}
            <div className="card" style={{ padding: '1rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h1 style={{ margin: 0, fontSize: '20px', color: COLORS.textDark }}>{profileData.static_profile?.name || profileData.student_name}</h1>
                    <span style={{ fontSize: '11px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: COLORS.textDark, padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>
                      · {profileData.static_profile?.total_sessions || (profileData.engagement_heatmap_data || []).length} Sessions
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                    {isRefetching && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: COLORS.primaryCyan, animation: 'pulse-teal 1s infinite' }} />}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                   <div style={{ fontSize: '10px', color: COLORS.muted, fontWeight: '700', letterSpacing: '0.5px' }}>RISK STATUS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <span style={{ 
                       fontSize: '16px', 
                       fontWeight: '800', 
                       color: getRiskColor(profileData.risk.risk_label?.toLowerCase()) 
                     }}>
                       {(profileData.risk.risk_score ?? 0).toFixed(2)}
                     </span>
                     <RiskBadge label={profileData.risk.risk_label} />
                   </div>
                </div>
              </div>

              {/* PULSE RIBBON */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                {(() => {
                  const lifetimeState = getLifetimeState();
                  
                  // Struggle logic
                  const siTrend = profileData.cognitive.si_trend || [0];
                  const avgSI = siTrend.reduce((a,b)=>a+b, 0) / (siTrend.length || 1);
                  const firstSI = siTrend[0];
                  const lastSI = siTrend[siTrend.length - 1];
                  let siArrow = '→'; let siColor = COLORS.muted;
                  if (lastSI > firstSI + 0.05) { siArrow = '↑'; siColor = COLORS.primaryRed; }
                  else if (lastSI < firstSI - 0.05) { siArrow = '↓'; siColor = COLORS.primaryCyan; }
                  
                  // Mastery logic
                  const masTraj = profileData.cognitive.mastery_trajectory || [0];
                  const firstM = masTraj[0];
                  const lastM = masTraj[masTraj.length - 1];
                  let mArrow = '→'; let mColor = COLORS.muted;
                  if (lastM > firstM + 0.05) { mArrow = '↑'; mColor = COLORS.primaryCyan; }
                  else if (lastM < firstM - 0.05) { mArrow = '↓'; mColor = COLORS.primaryRed; }

                  return (
                    <>
                      <div style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '10px', border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                           <div style={{ fontSize: '11px', color: COLORS.muted, fontWeight: '600' }}>STATE</div>
                         </div>
                         <span style={{ color: getStateColor(lifetimeState), fontWeight: '700', fontSize: '15px' }}>{lifetimeState}</span>
                      </div>
                      
                      <div style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '10px', border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                           <div style={{ fontSize: '11px', color: COLORS.muted, fontWeight: '600' }}>STRUGGLE</div>
                           <div style={{ fontSize: '10px', color: COLORS.muted }}>vs first session</div>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ color: getSIColor(avgSI), fontWeight: '700', fontSize: '15px' }}>{(avgSI ?? 0).toFixed(2)}</span>
                           <span style={{ color: siColor, fontWeight: '800', fontSize: '15px' }}>{siArrow}</span>
                         </div>
                      </div>
                      
                      <div style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '10px', border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                           <div style={{ fontSize: '11px', color: COLORS.muted, fontWeight: '600' }}>MASTERY</div>
                           <div style={{ fontSize: '10px', color: COLORS.muted }}>vs first session</div>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ color: getMasteryColor(lastM), fontWeight: '700', fontSize: '15px' }}>{(lastM ?? 0).toFixed(2)}</span>
                           <span style={{ color: mColor, fontWeight: '800', fontSize: '15px' }}>{mArrow}</span>
                         </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* INSIGHT BADGE */}
              <div style={{ background: COLORS.insightBg, padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '12px', color: '#0369a1', border: '1px solid #bae6fd' }}>
                {intelligentNote}
              </div>
            </div>

            {/* TAB SYSTEM */}
            <div style={{ display: 'flex', background: 'transparent', gap: '0.5rem', paddingLeft: '1rem', borderBottom: `1px solid ${COLORS.border}` }}>
              <TabButton id="cognitive" label="Cognitive" />
              <TabButton id="behavioral" label="Behavioral" />
              <TabButton id="emotional" label="Emotional" />
              <TabButton id="timeline" label="History" />
            </div>

            {/* TAB VIEWPORT */}
            <div className="card" style={{ paddingBottom: '3rem' }}>
              
              {activeTab === 'cognitive' && (
                <>
                  <CollapsibleSection 
                    id="cog_mastery" 
                    title="MASTERY TRAJECTORY (EMA)" 
                  >
                    <div style={{ height: '320px' }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <LineChart data={profileData.engagement_heatmap_data} margin={{top: 20, right: 20, left: 0, bottom: 0}}>
                          <XAxis dataKey="session_index" label={{ value: 'Session', position: 'insideBottom', offset: -5, fontSize: 10 }} fontSize={11} stroke={COLORS.muted} />
                          <YAxis domain={getChartDomain(profileData.cognitive.mastery_trajectory)} fontSize={11} stroke={COLORS.muted} tickFormatter={(v) => v.toFixed(2)} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(v) => [
                              <span>
                                <strong>EMA:</strong> {(parseFloat(v) || 0).toFixed(2)}
                              </span>, 
                              "Mastery Index"
                            ]} 
                            labelFormatter={(l) => `Session ${l}`} 
                          />
                          <Line type="monotone" dataKey="avg_mastery" stroke={COLORS.primaryCyan} strokeWidth={2} dot={{ r: 4 }}>
                            <LabelList dataKey="avg_mastery" position="top" formatter={(v) => (parseFloat(v) || 0).toFixed(2)} style={{fontSize: 10, fill: COLORS.textDark}} />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection 
                    id="cog_struggle" 
                    title="STRUGGLE INDEX TREND" 
                  >
                    <div style={{ height: '320px' }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <LineChart data={profileData.cognitive.si_trend.map((v, i) => ({session: i+1, si: Math.max(0, v)}))} margin={{top: 20, right: 20, left: 0, bottom: 0}}>
                          <XAxis dataKey="session" fontSize={10} stroke={COLORS.muted} />
                          <YAxis domain={[0, 'auto']} fontSize={10} stroke={COLORS.muted} tickFormatter={(v) => v.toFixed(2)} />
                          <Tooltip formatter={(v) => [(parseFloat(v) || 0).toFixed(2), "SI"]} labelFormatter={(l) => `Session ${l}`} />
                          <ReferenceLine y={0.5} stroke={COLORS.primaryRed} strokeDasharray="3 3" label={{ position: 'top', value: 'Risk threshold', fill: COLORS.primaryRed, fontSize: 11 }} />
                          <Line type="monotone" dataKey="si" stroke={COLORS.primaryOrange} strokeWidth={2} dot={{ r: 4 }}>
                             <LabelList dataKey="si" position="top" formatter={(v) => (parseFloat(v) || 0).toFixed(2)} style={{fontSize: 10, fill: COLORS.textDark}} />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection 
                    id="cog_hint" 
                    title="HINT DEPENDENCY PER SESSION" 
                  >
                    <div style={{ height: '320px' }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                         <BarChart data={profileData.cognitive.hint_dependency_per_session.map((v, i) => ({session: i+1, hints: v}))} margin={{top: 20, right: 30, left: 0, bottom: 0}}>
                           <XAxis dataKey="session" fontSize={10} stroke={COLORS.muted} />
                           <YAxis domain={[0, 'auto']} fontSize={10} stroke={COLORS.muted} tickFormatter={(v) => v.toFixed(2)} />
                           <Tooltip formatter={(v) => [`${(parseFloat(v) || 0).toFixed(2)} hints/question`, "Hints"]} labelFormatter={(l) => `Session ${l}`} />
                           <ReferenceLine 
                             y={0.5} 
                             stroke="#f39c12" 
                             strokeWidth={2} 
                             strokeDasharray="3 3" 
                             label={{ position: 'insideTopRight', value: 'Dependency threshold (0.5)', fill: '#f39c12', fontSize: 11 }} 
                           />
                           <Bar dataKey="hints" radius={[4, 4, 0, 0]} maxBarSize={50}>
                             {profileData.cognitive.hint_dependency_per_session.map((v, i) => (
                               <Cell key={`cell-${i}`} fill={v > 0.5 ? '#e74c3c' : '#1abc9c'} />
                             ))}
                             <LabelList dataKey="hints" position="top" formatter={(v) => (parseFloat(v) || 0).toFixed(2)} style={{fontSize: 10, fill: COLORS.textDark}} />
                           </Bar>
                         </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '1rem', fontWeight: '700', fontSize: '15px', color: COLORS.textDark }}>
                       {(profileData.cognitive.avg_hint_level_used || 0).toFixed(2)} hints/question avg
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {activeTab === 'behavioral' && (
                <CollapsibleSection 
                  id="beh_metrics" 
                  title="LIFETIME BEHAVIORAL METRICS" 
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {(() => {
                      const firstS = profileData.engagement_heatmap_data[0] || {};
                      const lastS = profileData.engagement_heatmap_data[profileData.engagement_heatmap_data.length - 1] || {};
                      
                      const pRate = profileData.behavioral.participation_rate;
                      const pColor = pRate > 0.75 ? COLORS.primaryCyan : (pRate >= 0.50 ? COLORS.primaryOrange : COLORS.primaryRed);
                      
                      let idleArrow = null;
                      if (lastS.avg_idle_time !== undefined && firstS.avg_idle_time !== undefined) {
                        if (lastS.avg_idle_time > firstS.avg_idle_time + 5) idleArrow = { sym: '↑', col: COLORS.primaryRed };
                        else if (lastS.avg_idle_time < firstS.avg_idle_time - 5) idleArrow = { sym: '↓', col: COLORS.primaryCyan };
                        else idleArrow = { sym: '→', col: COLORS.muted };
                      }
                      
                      let attArrow = null;
                      if (lastS.avg_attempt_count !== undefined && firstS.avg_attempt_count !== undefined) {
                        if (lastS.avg_attempt_count > firstS.avg_attempt_count + 0.5) attArrow = { sym: '↑', col: COLORS.primaryRed };
                        else if (lastS.avg_attempt_count < firstS.avg_attempt_count - 0.5) attArrow = { sym: '↓', col: COLORS.primaryCyan };
                        else attArrow = { sym: '→', col: COLORS.muted };
                      }

                      return (
                        <>
                          <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#f8fafc', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: COLORS.textDark }}>{Math.round(profileData.behavioral.avg_idle_time_per_session)}s</div>
                              {idleArrow && <span style={{ color: idleArrow.col, fontWeight: 'bold', fontSize: '1.2rem' }}>{idleArrow.sym}</span>}
                            </div>
                            <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '5px', fontWeight: '700' }}>AVG IDLE TIME</div>
                          </div>
                          
                          <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#f8fafc', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: COLORS.textDark }}>{(profileData.behavioral.avg_attempt_count_per_question ?? 0).toFixed(1)}</div>
                              {attArrow && <span style={{ color: attArrow.col, fontWeight: 'bold', fontSize: '1.2rem' }}>{attArrow.sym}</span>}
                            </div>
                            <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '5px', fontWeight: '700' }}>AVG ATTEMPTS</div>
                          </div>
                          
                          <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#f8fafc', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: '800', color: pColor }}>{Math.round(pRate * 100)}%</div>
                            <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '5px', fontWeight: '700' }}>PARTICIPATION</div>
                          </div>
                          
                          <div style={{ padding: '1.5rem', borderRadius: '12px', background: '#f8fafc', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: '800', color: profileData.behavioral.total_mistakes > 5 ? COLORS.primaryRed : COLORS.textDark }}>{profileData.behavioral.total_mistakes}</div>
                            <div style={{ fontSize: '10px', color: COLORS.muted, marginTop: '5px', fontWeight: '700' }}>TOTAL MISTAKES</div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </CollapsibleSection>
              )}

              {activeTab === 'emotional' && (
                <>
                  <CollapsibleSection 
                    id="emo_state" 
                    title="CHRONOLOGICAL STATE DISTRIBUTION" 
                  >
                    <div style={{ display: 'flex', height: '16px', borderRadius: '8px', overflow: 'hidden', background: '#f1f5f9' }}>
                      <div style={{ width: `${profileData.emotional.engaged_ratio * 100}%`, background: COLORS.primaryCyan }} title={`Engaged: ${Math.round(profileData.emotional.engaged_ratio * 100)}%`} />
                      <div style={{ width: `${profileData.emotional.struggling_ratio * 100}%`, background: COLORS.primaryOrange }} title={`Struggling: ${Math.round(profileData.emotional.struggling_ratio * 100)}%`} />
                      <div style={{ width: `${profileData.emotional.unengaged_ratio * 100}%`, background: COLORS.primaryRed }} title={`Unengaged: ${Math.round(profileData.emotional.unengaged_ratio * 100)}%`} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: COLORS.muted, marginTop: '5px' }}>
                      <span>Engaged ({Math.round(profileData.emotional.engaged_ratio * 100)}%)</span>
                      <span>Struggling ({Math.round(profileData.emotional.struggling_ratio * 100)}%)</span>
                      <span>Unengaged ({Math.round(profileData.emotional.unengaged_ratio * 100)}%)</span>
                    </div>
                  </CollapsibleSection>
                  
                  <CollapsibleSection 
                    id="emo_resilience" 
                    title="RESILIENCE & FRUSTRATION" 
                  >
                    <div style={{ display: 'flex', gap: '2rem' }}>
                      <div style={{ flex: 1, padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: '800', color: COLORS.primaryCyan }}>{profileData.emotional.recovery_events}</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: COLORS.textDark, marginBottom: '0.5rem' }}>Recovery Events</div>
                        <div style={{ fontSize: '11px', color: COLORS.muted }}>(Struggling → Engaged transitions within sessions, confirmed by hintless correct attempt)</div>
                        {profileData.emotional.recovery_events === 0 && <div style={{ fontSize: '11px', color: COLORS.muted, marginTop: '10px' }}>No recovery events recorded yet</div>}
                        {profileData.emotional.recovery_events >= 3 && <div style={{ fontSize: '11px', color: COLORS.primaryCyan, marginTop: '10px', fontWeight: '600' }}>Strong resilience pattern detected</div>}
                      </div>
                      
                      <div style={{ flex: 1, padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                           <span style={{ fontSize: '13px', fontWeight: '700', color: COLORS.textDark }}>Frustration Index</span>
                           <span style={{ fontSize: '2rem', fontWeight: '800', color: (profileData.emotional.frustration_index ?? 0) < 0.35 ? COLORS.primaryCyan : ((profileData.emotional.frustration_index ?? 0) < 0.65 ? COLORS.primaryOrange : COLORS.primaryRed) }}>
                             {((profileData.emotional.frustration_index ?? 0) * 100).toFixed(1)}%
                           </span>
                        </div>
                        <div style={{ width: '100%', height: '12px', borderRadius: '6px', background: '#e2e8f0', overflow: 'hidden' }}>
                           <div style={{ 
                             width: `${profileData.emotional.frustration_index * 100}%`, height: '100%', 
                             background: profileData.emotional.frustration_index < 0.35 ? COLORS.primaryCyan : (profileData.emotional.frustration_index < 0.65 ? COLORS.primaryOrange : COLORS.primaryRed) 
                           }} />
                        </div>
                        {profileData.emotional.frustration_index > 0.35 && (
                          <div style={{ fontSize: '11px', color: COLORS.primaryOrange, marginTop: '1rem', fontWeight: '600' }}>
                            Rapid incorrect re-attempts detected — student may benefit from a break
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {activeTab === 'timeline' && (
                <>
                  <CollapsibleSection 
                    id="hist_timeline" 
                    title="SESSION TIMELINE" 
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', overflowX: 'auto', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                      {profileData.engagement_heatmap_data.map((sess, idx) => {
                        const mastery = profileData.cognitive.mastery_trajectory[idx];
                        const isSelected = selectedSessionIdx === sess.session_index;
                        const borderW = isSelected ? '3px' : '1px';
                        const borderColor = isSelected ? COLORS.primaryCyan : COLORS.border;
                        const val = Number(sess.avg_SI || 0);
                        const cleanSI = (Math.abs(val) < 0.005 ? 0 : val).toFixed(2);
                        
                        return (
                          <div 
                            key={sess.session_index}
                            onClick={() => setSelectedSessionIdx(sess.session_index)}
                            title={`Session ${sess.session_index}\nDominant State: ${sess.dominant_state}\nSI: ${cleanSI}\nMastery: ${mastery ? mastery.toFixed(2) : 'N/A'}`}
                            style={{ 
                              display: 'flex', flexDirection: 'column', alignItems: 'center', 
                              cursor: 'pointer', transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                              transition: 'all 0.2s ease', filter: isSelected ? 'drop-shadow(0 0 8px #2EC4B640)' : 'none',
                              minWidth: '50px'
                            }}
                          >
                            <div style={{
                              width: '42px', 
                              height: '42px', 
                              borderRadius: '50%',
                              background: getStateColor(sess.dominant_state),
                              flexShrink: 0,
                              border: `${borderW} solid ${borderColor}`,
                              marginBottom: '0.8rem',
                              boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${COLORS.primaryCyan}` : 'none'
                            }} />
                            <div style={{ fontSize: '13px', fontWeight: isSelected ? '800' : '700', color: isSelected ? COLORS.primaryCyan : COLORS.textDark }}>S{sess.session_index}</div>
                            <div style={{ fontSize: '11px', color: COLORS.muted }}>SI: {cleanSI}</div>
                          </div>
                        )
                      })}
                      {profileData.engagement_heatmap_data.length === 0 && (
                         <div style={{ width: '100%', textAlign: 'center', color: COLORS.muted, fontSize: '14px', fontStyle: 'italic', padding: '1rem' }}>
                           Data Synced: 0 Rows Found
                         </div>
                      )}
                    </div>
                  </CollapsibleSection>
                  
                  <CollapsibleSection 
                    id="hist_table" 
                    title="SESSION DETAIL TABLE" 
                  >
                    <table className="session-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr>
                          <th>Session</th>
                          <th>Dominant State</th>
                          <th>Avg SI</th>
                          <th>Avg Mastery</th>
                          <th>Hints Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileData.engagement_heatmap_data.map((sess, idx) => {
                          const isSelected = selectedSessionIdx === sess.session_index;
                          const rowBg = isSelected ? '#F0F9FF' : (sess.dominant_state === 'Engaged' ? '#f0fdfa' : (sess.dominant_state === 'Struggling' ? '#fffbeb' : '#fff1f2'));
                          
                          const si = sess.avg_SI || 0;
                          const mastery = sess.avg_mastery || 0;
                          const hints = sess.hints_used || 0;

                          return (
                            <tr 
                              key={sess.session_index} 
                              onClick={() => setSelectedSessionIdx(sess.session_index)}
                              style={{ 
                                background: rowBg, cursor: 'pointer', 
                                borderLeft: isSelected ? `4px solid ${COLORS.primaryCyan}` : 'none',
                                transition: 'all 0.2s'
                              }}
                            >
                              <td style={{ fontWeight: '600' }}>S{sess.session_index}</td>
                              <td>
                                <span style={{ background: getStateColor(sess.dominant_state), color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                  {sess.dominant_state}
                                </span>
                              </td>
                              <td style={{ fontWeight: '600', color: getSIColor(si) }}>{si.toFixed(2)}</td>
                              <td>{mastery.toFixed(2)}</td>
                              <td>{hints.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CollapsibleSection>

                  {/* SESSION DRILL-DOWN LOGS */}
                  {selectedSessionIdx && profileData.session_logs && profileData.session_logs[selectedSessionIdx] && (
                    <CollapsibleSection 
                      id="session_drill" 
                      title={`QUESTION LOG: SESSION ${selectedSessionIdx}`}
                      subtitle="Specific behavior per question within the selected session"
                    >
                      <table className="session-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr>
                            <th>Question</th>
                            <th>Struggle (SI)</th>
                            <th>Hints Used</th>
                            <th>Result</th>
                            <th>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const rawLogs = profileData.session_logs[selectedSessionIdx].filter(log => log.learner_state !== 'Finished' && log.current_question_text);
                            const groupedLogs = [];
                            let currentGroup = null;

                            rawLogs.forEach(log => {
                              if (!currentGroup || currentGroup.question !== log.current_question_text) {
                                if (currentGroup) groupedLogs.push(currentGroup);
                                currentGroup = {
                                  question: log.current_question_text,
                                  attempts: 1,
                                  max_si: log.struggle_index || 0,
                                  max_hints: log.question_hints || 0,
                                  final_result: log.is_correct ? '✅ Success' : '❌ Mistake',
                                  timestamp: log.timestamp
                                };
                              } else {
                                currentGroup.attempts++;
                                if ((log.struggle_index || 0) > currentGroup.max_si) currentGroup.max_si = log.struggle_index;
                                if ((log.question_hints || 0) > currentGroup.max_hints) currentGroup.max_hints = log.question_hints;
                                currentGroup.final_result = log.is_correct ? '✅ Success' : '❌ Mistake';
                                currentGroup.timestamp = log.timestamp;
                              }
                            });
                            if (currentGroup) groupedLogs.push(currentGroup);

                            return groupedLogs.map((group, i) => (
                              <tr key={i}>
                                <td style={{ fontWeight: '500' }}>
                                  {group.question} <br/>
                                  <span style={{ fontSize: '11px', color: COLORS.muted }}>({group.attempts} attempt{group.attempts > 1 ? 's' : ''})</span>
                                </td>
                                <td style={{ color: getSIColor(group.max_si), fontWeight: '700' }}>
                                  {group.max_si.toFixed(3)} <span style={{ fontSize: '10px', color: COLORS.border, marginLeft: '4px' }}>MAX</span>
                                </td>
                                <td>
                                  <span style={{ fontWeight: '600', fontSize: '13px', color: group.max_hints > 0 ? COLORS.primaryOrange : COLORS.muted }}>
                                    {group.max_hints}
                                  </span>
                                </td>
                                <td style={{ fontWeight: group.final_result.includes('Success') ? '700' : '500', color: group.final_result.includes('Success') ? COLORS.primaryCyan : COLORS.textDark }}>
                                  {group.final_result}
                                </td>
                                <td style={{ fontSize: '11px', color: COLORS.muted }}>
                                  {new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </CollapsibleSection>
                  )}
                </>
              )}

            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
