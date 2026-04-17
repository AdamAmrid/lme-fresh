import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FiHome, FiPieChart, FiSettings, FiLogOut, FiMenu } from 'react-icons/fi';
import LearnerProfileView from './analytics/LearnerProfileView';
import CohortView from './analytics/CohortView';
import PredictivePanel from './analytics/PredictivePanel';

export default function AnalyticsDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  useEffect(() => {
    if (!user || user.role !== 'instructor') {
      navigate('/login');
    }
  }, [user, navigate]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-color)', color: 'var(--text-main)', overflow: 'hidden' }}>
      {/* SIDEBAR */}
      <div style={{ width: isSidebarOpen ? '260px' : '0px', transition: 'width 0.3s ease', overflow: 'hidden',display: 'flex', flexDirection: 'column', boxShadow: '2px 0 15px rgba(0,0,0,0.03)', zIndex: 10 }}>
        <div style={{ width: '260px', opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s ease', background: 'var(--sidebar-bg)', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h2 style={{ fontFamily: 'var(--font-logo)', marginBottom: '2.5rem', borderBottom: '2px solid #f0f0f0', paddingBottom: '1rem', color: 'var(--primary-orange)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FiPieChart size={24} /> LME Console
        </h2>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ padding: '1rem', borderRadius: '12px', cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '1rem', fontWeight: 'bold' }}>
            <FiHome size={20} /> <a href="/dashboard" style={{color: 'inherit', textDecoration: 'none'}}>Dashboard</a>
          </div>
          <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--secondary-cyan)', color: 'var(--primary-cyan)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
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
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', padding: '2rem', paddingBottom: '0' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              title="Toggle Menu"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)', padding: '0.5rem', display: 'flex', alignItems: 'center', borderRadius: '8px' }}
              onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <FiMenu size={26} />
            </button>
            <div>
              <h1 style={{ fontFamily: 'var(--font-logo)', margin: 0, fontSize: '2rem', color: 'var(--text-main)' }}>Deep Analytics</h1>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-light)', fontWeight: 'bold' }}>Intelligence & Profiling Engine</p>
            </div>
          </div>
        </header>

        {/* TABS CONTROLS */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid #e2e8f0', marginBottom: '2rem' }}>
          {[
            { id: 'profile', label: 'Learner Profiles' },
            { id: 'cohort', label: 'Cohort Overview' },
            { id: 'predictive', label: 'Predictive Panel' }
          ].map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.75rem 1.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                color: activeTab === tab.id ? 'var(--primary-cyan)' : 'var(--text-light)',
                borderBottom: activeTab === tab.id ? '3px solid var(--primary-cyan)' : '3px solid transparent',
                transform: 'translateY(2px)',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {/* TAB CONTENT (Fills remaining height) */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '2rem' }}>
          {activeTab === 'profile' && (
            <LearnerProfileView 
              selectedStudentId={selectedStudentId} 
              setSelectedStudentId={setSelectedStudentId} 
            />
          )}
          {activeTab === 'cohort' && (
            <CohortView 
              onSelectStudent={(id) => {
                setSelectedStudentId(id);
                setActiveTab('profile');
              }}
            />
          )}
          {activeTab === 'predictive' && (
            <PredictivePanel 
              onSelectStudent={(id) => {
                setSelectedStudentId(id);
                setActiveTab('profile');
              }}
            />
          )}
        </div>

      </div>
    </div>
  );
}
