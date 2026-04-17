import { useCallback, useMemo } from 'react';

export function useAnalytics() {
  const getHeaders = () => {
    const token = localStorage.getItem('lme_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const executeFetch = useCallback(async (endpoint) => {
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: getHeaders()
      });
      if (!response.ok) {
        throw new Error(`Analytics API error: ${response.status}`);
      }
      const data = await response.json();
      return { data, loading: false, error: null };
    } catch (err) {
      return { data: null, loading: false, error: err.message };
    }
  }, []);

  const fetchCohort = useCallback(() => {
    return executeFetch('/analytics/cohort');
  }, [executeFetch]);

  const fetchStudent = useCallback((id) => {
    return executeFetch(`/analytics/student/${encodeURIComponent(id)}`);
  }, [executeFetch]);

  const fetchRisk = useCallback(() => {
    return executeFetch('/analytics/risk');
  }, [executeFetch]);

  return useMemo(() => ({ 
    fetchCohort, 
    fetchStudent, 
    fetchRisk 
  }), [fetchCohort, fetchStudent, fetchRisk]);
}
