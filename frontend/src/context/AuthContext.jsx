import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const parseJwt = (token) => JSON.parse(atob(token.split('.')[1]));

  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('lme_token');
    if (token) {
        try {
            const decoded = parseJwt(token);
            return { 
                id: decoded.id, 
                email: decoded.sub, 
                name: decoded.name || decoded.sub, 
                role: decoded.role, 
                token 
            };
        } catch { return null; }
    }
    return null;
  });
  
  const navigate = useNavigate();

  const login = async (email, password) => {
    // Clean login: no more mock 'name' or 'role' needed!
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
    const response = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
    const { access_token } = response.data;
    const decoded = parseJwt(access_token);
    
    // Decoded now includes the real 'name' from the DB!
    const loggedUser = { 
      id: decoded.id, 
      email: decoded.sub, 
      name: decoded.name || decoded.sub, 
      role: decoded.role, 
      token: access_token 
    };
    
    setUser(loggedUser);
    localStorage.setItem('lme_token', access_token);
    
    if (decoded.role === 'student') navigate('/quiz');
    if (decoded.role === 'instructor') navigate('/dashboard');
  };

  const register = async (email, password, role, name) => {
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
    await axios.post(`${API_BASE}/api/auth/register`, { email, password, role, name });
    await login(email, password);
  };

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('lme_token');
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    // 1. Verify token against the live database to prevent phantom sessions if user is deleted
    if (user?.token) {
      console.log("Interceptor Ping: Asserting JWT against SQLite backend...");
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
      axios.get(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${user.token}` }
      }).catch(err => {
        console.error("Auth sync failure (DB record missing or invalid). Purging phantom block.", err);
        setUser(null);
        localStorage.removeItem('lme_token');
        window.location.href = '/login'; 
      });
    }

    let timeoutId;
    let lastActivity = 0; // Throttle guard

    const resetTimer = () => {
      const now = Date.now();
      if (now - lastActivity < 1000) return; // Throttle reset to max once per second
      lastActivity = now;

      clearTimeout(timeoutId);
      if (user) {
        // Enforce 24-hour inactivity auto-logout
        timeoutId = setTimeout(() => {
          console.log("Session expired due to 24h inactivity");
          logout();
        }, 24 * 60 * 60 * 1000); 
      }
    };

    // Also continuously verify JWT expiry
    const jwtCheckId = setInterval(() => {
      if (user && user.token) {
        try {
          const { exp } = parseJwt(user.token);
          if (Date.now() >= exp * 1000) {
            console.log("JWT token logically expired");
            logout();
          }
        } catch {
          logout();
        }
      }
    }, 60000); // Check every minute

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    
    resetTimer(); // Initialize on mount

    return () => {
      clearTimeout(timeoutId);
      clearInterval(jwtCheckId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
