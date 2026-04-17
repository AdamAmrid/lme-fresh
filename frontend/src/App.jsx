import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import StudentQuiz from './pages/StudentQuiz';
import InstructorDashboard from './pages/InstructorDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import LandingPage from './pages/LandingPage';

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" />;
  if (allowedRole && user.role !== allowedRole) return <Navigate to="/login" />;
  return children;
};

const AppContent = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/quiz" element={
        <ProtectedRoute allowedRole="student"><StudentQuiz /></ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRole="instructor"><InstructorDashboard /></ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute allowedRole="instructor"><AnalyticsDashboard /></ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
