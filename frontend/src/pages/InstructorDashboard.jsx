import React, { useState, useEffect, useContext } from 'react';
import * as XLSX from 'xlsx';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiHome, FiPieChart, FiSettings, FiLogOut, FiX, FiActivity, FiUser, FiCheckCircle, FiClock } from 'react-icons/fi';
import { useWebSocket } from '../hooks/useWebSocket';

const STATE_COLORS = {
  Engaged: '#2EC4B6',    // Cyan
  Struggling: '#FF9F1C', // Orange
  Unengaged: '#EF233C',  // Red
  Finished: '#6D597A',   // Purple
  Unknown: '#9094A6'
};

export default function InstructorDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  
  // 1. Standardized Admin Connection (Fixes Error 1008)
  const { lastMessage } = useWebSocket('instructor');

  const [students, setStudents] = useState({});
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionStartTime] = useState(Date.now());

  // 3. POLLING FALLBACK (For Vercel/Serverless)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/analytics/live-feed`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
          setStudents(prev => {
            const next = { ...prev };
            data.forEach(stu => {
              // Only update if it's more recent or new
              next[stu.student_id] = {
                ...next[stu.student_id],
                ...stu,
                lastSeen: new Date().toLocaleTimeString()
              };
            });
            return next;
          });
        }
      } catch (err) {
        console.error("Polling Error:", err);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, []);

  // 2. Telemetry Processor (Triggered by every student heartbeat)
  useEffect(() => {
    if (lastMessage) {
      // Handle student disconnect events — auto-clean the feed
      if (lastMessage.type === 'student_disconnected' && lastMessage.student_id) {
        setStudents(prev => {
          const next = { ...prev };
          delete next[lastMessage.student_id];
          return next;
        });
        // Also clean up the selected student panel if they were selected
        setSelectedStudentId(prev => prev === lastMessage.student_id ? null : prev);
        return;
      }

      const data = lastMessage;
      // data: { student_id, student_name, state, si, ... }
      
      // CRITICAL GUARD: Only process messages that contain student telemetry
      if (!data.student_id) return;
      
      setStudents(prev => {
        const prevStudent = prev[data.student_id];
        
             // Alert Engine: Struggling or Unengaged detections
        if (data.state === 'Struggling' || data.state === 'Unengaged') {
           if (!prevStudent || prevStudent.state !== data.state || (data.idle_time > 30 && prevStudent.idle_time <= 30)) {
             // Alert logic removed as it was unused
           }
        }

        const isLobbyPacket = data.module === 'Selecting...' || data.current_question_text === 'In Lobby';
        const isSessionComplete = data.type === 'session_complete';

        return {
          ...prev,
          [data.student_id]: {
            ...prev[data.student_id],
            ...data,
            totalHints: isLobbyPacket ? 0 : (data.totalHints ?? prev[data.student_id]?.totalHints ?? 0),
            // Save last reported idle_time so local timer knows when to count totalIdleTime
            lastReportedIdleTime: data.idle_time ?? prev[data.student_id]?.lastReportedIdleTime ?? 0,
            // session_complete = accurate final; lobby = reset; mid-session = use packet to correct
            totalIdleTime: isLobbyPacket ? 0
              : isSessionComplete ? (data.totalIdleTime || 0)
              : (data.totalIdleTime ?? prev[data.student_id]?.totalIdleTime ?? 0),
            lastSeen: new Date().toLocaleTimeString()
          }
        };
      });
    }
  }, [lastMessage]);

  useEffect(() => {
    if (!user || user.role !== 'instructor') {
      navigate('/login');
      return;
    }
  }, [user, navigate]);

  // LIVE IDLE TIMER TICK: increments idle_time for state prediction + totalIdleTime for smooth display
  useEffect(() => {
    const timer = setInterval(() => {
      setStudents(prev => {
        const next = { ...prev };
        let hasChanged = false;
        Object.keys(next).forEach(id => {
          if (next[id].state !== 'Finished') {
            const nextIdle = (next[id].idle_time || 0) + 1;
            let nextState = next[id].state;

            const isInLobby = next[id].module === 'Selecting...' ||
                              next[id].current_question === 'In Lobby';

            if (!isInLobby) {
              if (nextIdle > 60) nextState = 'Unengaged';
              else if (nextIdle > 30 && nextState === 'Engaged') nextState = 'Struggling';
            }

            // Only count totalIdleTime when student's last packet shows they were idle (idle_time > 1)
            // This stops counting when student becomes active (next packet will have idle_time: 0)
            const studentWasIdle = (next[id].lastReportedIdleTime || 0) > 1;
            const nextTotalIdle = (next[id].totalIdleTime || 0) + (studentWasIdle ? 1 : 0);

            next[id] = { ...next[id], idle_time: nextIdle, totalIdleTime: isInLobby ? 0 : nextTotalIdle, state: nextState };
            hasChanged = true;
          }
        });
        return hasChanged ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Derived metrics
  const studentList = Object.values(students);
  const totalStudents = studentList.length;
  const strugglingCount = studentList.filter(s => s.state === 'Struggling').length;
  const unengagedCount = studentList.filter(s => s.state === 'Unengaged').length;
  const selectedStudent = selectedStudentId ? students[selectedStudentId] : null;



  const exportExcel = () => {
    const durationSec = Math.floor((Date.now() - sessionStartTime) / 1000);
    const dateStr = new Date().toLocaleDateString('en-GB');
    const avgMastery = studentList.length
      ? Math.round(studentList.reduce((acc, s) => acc + (s.current_score || 0) * 100, 0) / studentList.length)
      : 0;

    // ── Sheet 1: Summary ──────────────────────────────────────────
    const summaryData = [
      ['LME Session Report'],
      ['Date', dateStr],
      ['Duration', `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`],
      ['Total Students', studentList.length],
      ['Average Mastery', `${avgMastery}%`],
      ['Students Who Struggled', studentList.filter(s => (s.totalMistakes || 0) >= 3 || s.state === 'Struggling').length],
      ['Students Who Finished', studentList.filter(s => s.state === 'Finished').length],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }];

    // ── Sheet 2: Student Breakdown ────────────────────────────────
    const breakdownHeaders = ['Student Name', 'Student ID', 'Module', 'Mastery (%)', 'Total Mistakes', 'Total Idle Time (s)', 'Hints Requested', 'Final State'];
    const breakdownRows = studentList.map(s => [
      s.student_name || s.student_id,
      s.student_id,
      s.module || '--',
      Math.round((s.current_score || 0) * 100),
      s.totalMistakes || 0,
      s.totalIdleTime || 0,
      s.totalHints || 0,
      s.state || 'Unknown'
    ]);
    const breakdownSheet = XLSX.utils.aoa_to_sheet([breakdownHeaders, ...breakdownRows]);
    breakdownSheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];

    // ── Build workbook & download ─────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(wb, breakdownSheet, 'Student Breakdown');
    XLSX.writeFile(wb, `LME_Session_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-color)', color: 'var(--text-main)', overflow: 'hidden' }}>
      {/* SIDEBAR */}
      <div style={{ width: '260px', background: 'var(--sidebar-bg)', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', boxShadow: '2px 0 15px rgba(0,0,0,0.03)', zIndex: 10 }}>
        <h2 style={{ fontFamily: 'var(--font-logo)', marginBottom: '2.5rem', borderBottom: '2px solid #f0f0f0', paddingBottom: '1rem', color: 'var(--primary-orange)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FiPieChart size={24} /> LME Console
        </h2>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--secondary-cyan)', color: 'var(--primary-cyan)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
            <FiHome size={20} /> Dashboard
          </div>
          <div onClick={() => navigate('/analytics')} style={{ padding: '1rem', borderRadius: '12px', cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '1rem', fontWeight: 'bold', transition: '0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
            <FiPieChart size={20} /> Analytics
          </div>
          <div style={{ padding: '1rem', borderRadius: '12px', cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '1rem', fontWeight: 'bold' }}>
            <FiSettings size={20} /> Settings
          </div>
        </nav>
        <button onClick={logout} style={{ padding: '1rem', borderRadius: '12px', background: '#ffebee', border: 'none', color: '#EF233C', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', fontWeight: 'bold', transition: '0.2s' }}>
          <FiLogOut size={20} /> Sign Out
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-logo)', margin: 0, fontSize: '2rem', color: 'var(--text-main)' }}>Class Overview</h1>
            <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-light)', fontWeight: 'bold' }}>Live Session // Instructor {user?.name || user?.id}</p>
          </div>
          <button className="btn-danger" onClick={() => setShowSummary(true)}>🛑 End Session</button>
        </header>

        {/* 1. PULSE BAR */}
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2.5rem' }}>
          {[{label: 'Total Active Tracker', val: totalStudents, bg: 'var(--card-bg)', color: 'var(--primary-cyan)'},
            {label: 'Struggling Network', val: strugglingCount, bg: '#fffaf0', color: 'var(--primary-orange)'},
            {label: 'Unengaged Nodes', val: unengagedCount, bg: '#fff0f2', color: '#EF233C'}
           ].map((card, i) => (
            <div key={i} className="card fade-in" style={{ flex: 1, background: card.bg, borderTop: `4px solid ${card.color}`, display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-light)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>{card.label}</h4>
              <h2 style={{ margin: 0, color: card.color, fontFamily: 'var(--font-logo)', fontSize: '2.5rem' }}>{card.val}</h2>
            </div>
          ))}
        </div>

        {/* Dynamic Split Pane */}
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', alignItems: 'flex-start' }}>
          
          {/* 2. LIVE STUDENT LIST (Left, Takes up more space if no student selected) */}
          <div className="card" style={{ flex: selectedStudent ? '1' : '1', transition: 'all 0.3s' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FiUser color="var(--primary-cyan)"/> Live Learner Feed</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {studentList.sort((a,b) => {
                const order = {Unengaged:0, Struggling:1, Engaged:2, Unknown:3};
                return order[a.state] - order[b.state];
              }).map(s => (
                <div key={s.student_id} onClick={() => setSelectedStudentId(s.student_id)} className="card hover-glow" style={{ cursor: 'pointer', borderLeft: `6px solid ${s.module === 'Selecting...' ? '#9094A6' : STATE_COLORS[s.state]}`, background: selectedStudentId === s.student_id ? '#f8fafc' : 'transparent', transition: 'background 0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{s.student_name || s.student_id.split('@')[0]}</span>
                       <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{s.student_id}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {s.help_needed && <span className="fade-in" style={{ padding: '0.2rem 0.5rem', background: '#EF233C', color: 'white', borderRadius: '4px', fontSize: '0.7rem' }}>🆘 SOS</span>}
                      {(s.totalHints > 0) && (
                        <span style={{ padding: '0.2rem 0.5rem', background: '#FFF8E7', color: '#B45309', border: '1px solid #FFD97D', borderRadius: '20px', fontSize: '0.72rem', fontWeight: '700' }}>
                          💡 {s.totalHints}
                        </span>
                      )}
                      <span style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '800', background: s.module === 'Selecting...' ? '#9094A615' : `${STATE_COLORS[s.state] || '#ccc'}15`, color: s.module === 'Selecting...' ? '#9094A6' : (STATE_COLORS[s.state] || 'black') }}>
                        {s.module === 'Selecting...' ? '🕐 In Lobby' : s.state}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.5rem', display: 'block' }}>Module: {s.module || '--'}</span>
                </div>
              ))}
              {studentList.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-light)' }}>Awaiting telemetry streams...</div>}
            </div>
          </div>

          {/* 3. STUDENT PROFILER & INTERVENTION ENGINE (Right, Slide in) */}
          {selectedStudent && (
            (() => {
              const isInLobby = selectedStudent.module === 'Selecting...' || selectedStudent.current_question === 'In Lobby';
              const panelColor = isInLobby ? '#9094A6' : STATE_COLORS[selectedStudent.state];
              return (
            <div className="card fade-in" style={{ flex: '1.5', borderTop: `6px solid ${panelColor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--secondary-cyan)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--primary-cyan)', fontSize: '1.5rem' }}>
                      <FiUser />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{selectedStudent.student_name || selectedStudent.student_id.split('@')[0]}</h2>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', margin: 0 }}>{selectedStudent.student_id}</p>
                    </div>
                  </div>
                  <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FiActivity color={panelColor} /> 
                    {isInLobby
                      ? '🕐 Waiting to start a module...'
                      : selectedStudent.state === 'Finished'
                        ? 'Session Complete'
                        : `Currently ${selectedStudent.state} — ${selectedStudent.totalIdleTime || 0}s total idle this session`
                    }
                  </p>
                  {selectedStudent.help_needed && (
                    <div className="fade-in" style={{ background: '#EF233C15', color: '#EF233C', padding: '0.75rem', borderRadius: '8px', marginTop: '1rem', fontWeight: 'bold', border: '1px solid #EF233C', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                       🆘 HELP REQUESTED: Student is waiting for your hint!
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedStudentId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><FiX size={24}/></button>
              </div>

              {/* --- HIGH VISIBILITY STATE BANNER --- */}
              {isInLobby ? (
                <div style={{
                    background: '#9094A615',
                    color: '#9094A6',
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '2px solid #9094A6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    marginBottom: '1.5rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>
                  <FiClock /> Student is in Lobby
                </div>
              ) : selectedStudent.state !== 'Finished' && (
                <div style={{
                    background: STATE_COLORS[selectedStudent.state] + '15',
                    color: STATE_COLORS[selectedStudent.state],
                    padding: '1rem',
                    borderRadius: '12px',
                    border: `2px solid ${STATE_COLORS[selectedStudent.state]}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    marginBottom: '1.5rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                  }}>
                  <FiActivity /> Student is {selectedStudent.state}
                </div>
              )}

              {selectedStudent.state === 'Finished' ? (
                /* --- FINISHED SESSION DIAGNOSTICS --- */
                <div className="fade-in">
                  <div style={{ background: 'var(--secondary-cyan)', padding: '1.5rem', borderRadius: '15px', marginBottom: '2rem', border: '1px solid var(--primary-cyan)' }}>
                    <h3 style={{ margin: 0, color: 'var(--primary-cyan)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FiCheckCircle /> Diagnostic Summary
                    </h3>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Mastery Index</p>
                      <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#6D597A' }}>{Math.round(selectedStudent.current_score * 100)}%</p>
                    </div>
                    <div style={{ background: '#fff0f2', padding: '1rem', borderRadius: '12px', border: '1px solid #EF233C20' }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Total Mistakes</p>
                      <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#EF233C' }}>{selectedStudent.totalMistakes || 0}</p>
                    </div>
                    <div style={{ background: '#fffaf0', padding: '1rem', borderRadius: '12px', border: '1px solid #FF9F1C20' }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Total Idle</p>
                      <p style={{ margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-orange)' }}>{selectedStudent.totalIdleTime || 0}s</p>
                    </div>
                    <div style={{
                      background: (selectedStudent.totalHints || 0) > 6 ? '#FEE2E2' : (selectedStudent.totalHints || 0) > 3 ? '#FFF8E7' : '#f8fafc',
                      padding: '1rem', borderRadius: '12px',
                      border: `1px solid ${(selectedStudent.totalHints || 0) > 6 ? '#FECACA' : (selectedStudent.totalHints || 0) > 3 ? '#FFD97D' : '#e2e8f0'}`,
                    }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Hints Requested</p>
                      <p style={{
                        margin: '0.3rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold',
                        color: (selectedStudent.totalHints || 0) > 6 ? '#EF4444' : (selectedStudent.totalHints || 0) > 3 ? '#B45309' : '#9CA3AF'
                      }}>💡 {selectedStudent.totalHints || 0}</p>
                    </div>
                  </div>

                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-light)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Question Breakdown</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {selectedStudent.history && selectedStudent.history.map((h, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#fff', borderRadius: '10px', border: '1px solid #f0f0f0' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '500', maxWidth: '70% ', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {idx + 1}. {h.question}
                        </span>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: '800', 
                          color: h.attempts === 1 ? '#2EC4B6' : h.attempts < 3 ? 'var(--primary-orange)' : '#EF233C' 
                        }}>
                          {h.attempts === 1 ? '✅ 1st Attempt' : `🟠 ${h.attempts} Attempts`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button className="btn-secondary" onClick={() => setSelectedStudentId(null)} style={{ width: '100%', marginTop: '2rem' }}>
                    Close Report
                  </button>
                </div>
              ) : (
                /* --- LIVE SESSION VIEW --- */
                <>
                  <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-cyan)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Active Problem ({selectedStudent.module})</h4>
                    <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)', fontFamily: 'var(--font-logo)' }}>
                      {selectedStudent.current_question || "Browsing map..."}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '12px' }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Struggle Index</p>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{selectedStudent.si}</p>
                    </div>
                    <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '12px' }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Mastery Index</p>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{Math.round(selectedStudent.current_score * 100)}%</p>
                    </div>
                    <div style={{
                      background: (selectedStudent.totalHints || 0) > 6 ? '#FEE2E2' : (selectedStudent.totalHints || 0) > 3 ? '#FFF8E7' : '#f8fafc',
                      padding: '1rem', borderRadius: '12px',
                      border: `1px solid ${(selectedStudent.totalHints || 0) > 6 ? '#FECACA' : (selectedStudent.totalHints || 0) > 3 ? '#FFD97D' : '#e2e8f0'}`,
                    }}>
                      <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Hints Requested</p>
                      <p style={{
                        margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold',
                        color: (selectedStudent.totalHints || 0) > 6 ? '#EF4444' : (selectedStudent.totalHints || 0) > 3 ? '#B45309' : '#9CA3AF'
                      }}>💡 {selectedStudent.totalHints || 0}</p>
                    </div>
                  </div>

                  {/* No instructor AI-hint button here — student requests hints themselves via the quiz UI */}
                </>
              )}
            </div>
              );
            })()
          )}
        </div>

      </div>

      {/* SUMMARY MODAL */}
      {showSummary && (() => {
        const durationSec = Math.floor((Date.now() - sessionStartTime) / 1000);
        const avgMastery = studentList.length
          ? Math.round(studentList.reduce((acc, s) => acc + (s.current_score || 0) * 100, 0) / studentList.length)
          : 0;
        const struggledCount = studentList.filter(s => s.state === 'Struggling' || (s.totalMistakes || 0) >= 3).length;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '2rem' }}>
            <div className="card fade-in" style={{ width: '700px', maxHeight: '85vh', overflowY: 'auto', borderTop: '6px solid var(--primary-cyan)' }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-logo)' }}>📋 Session Report</h2>
                  <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-light)', fontSize: '0.9rem' }}>
                    {new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
                  </p>
                </div>
                <button onClick={() => setShowSummary(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-light)' }}>✕</button>
              </div>

              {/* Class-level KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                {[
                  { label: 'Duration',        value: `${Math.floor(durationSec/60)}m ${durationSec%60}s`, color: 'var(--primary-cyan)' },
                  { label: 'Students',        value: studentList.length, color: 'var(--primary-cyan)' },
                  { label: 'Avg Mastery',     value: `${avgMastery}%`,   color: avgMastery >= 70 ? '#22C55E' : avgMastery >= 40 ? '#FF9F1C' : '#EF233C' },
                  { label: 'Needed Support',  value: struggledCount,     color: struggledCount > 0 ? '#FF9F1C' : '#22C55E' },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: 'var(--bg-color)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-light)', letterSpacing: '1px' }}>{kpi.label}</p>
                    <p style={{ margin: '0.4rem 0 0 0', fontSize: '1.6rem', fontWeight: 'bold', color: kpi.color }}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Per-student table */}
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-light)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Student Breakdown</h4>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                {/* Table Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', background: '#f8fafc', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span>Student</span><span style={{textAlign:'center'}}>Module</span><span style={{textAlign:'center'}}>Mastery</span><span style={{textAlign:'center'}}>Mistakes</span><span style={{textAlign:'center'}}>Hints</span><span style={{textAlign:'center'}}>State</span>
                </div>
                {/* Rows */}
                {studentList.length === 0 && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-light)' }}>No student data recorded.</div>
                )}
                {studentList.map((s, i) => {
                  const mastery = Math.round((s.current_score || 0) * 100);
                  const stateColor = STATE_COLORS[s.state] || '#9094A6';
                  return (
                    <div key={s.student_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', padding: '0.85rem 1rem', alignItems: 'center', borderTop: i > 0 ? '1px solid #f0f0f0' : 'none', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{s.student_name || s.student_id}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{s.student_id}</div>
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '0.85rem', textTransform: 'capitalize' }}>{s.module || '--'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 'bold', color: mastery >= 70 ? '#22C55E' : mastery >= 40 ? '#FF9F1C' : '#EF233C' }}>{mastery}%</div>
                      <div style={{ textAlign: 'center', fontWeight: 'bold', color: (s.totalMistakes || 0) >= 5 ? '#EF233C' : (s.totalMistakes || 0) >= 3 ? '#FF9F1C' : '#22C55E' }}>{s.totalMistakes || 0}</div>
                      <div style={{ textAlign: 'center', fontWeight: 'bold', color: (s.totalHints || 0) > 6 ? '#EF4444' : (s.totalHints || 0) > 3 ? '#B45309' : '#9CA3AF' }}>💡 {s.totalHints || 0}</div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', background: `${stateColor}20`, color: stateColor }}>{s.state || '—'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn-primary" onClick={exportExcel} style={{ flex: 1 }}>⬇ Download Report (.xlsx)</button>
                <button className="btn-secondary" onClick={() => setShowSummary(false)} style={{ flex: 1 }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
