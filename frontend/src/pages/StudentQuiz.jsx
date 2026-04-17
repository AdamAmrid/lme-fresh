import React, { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FiAward, FiUser, FiActivity, FiLifeBuoy, FiAlertCircle } from 'react-icons/fi';
import { useWebSocket } from '../hooks/useWebSocket';
import { buildTelemetryPacket } from '../utils/telemetry';
import QuizQuestion from '../components/QuizQuestion';
import FeedbackToast from '../components/FeedbackToast';
import { mathsQuestions, logicQuestions } from '../data/quizQuestions';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StudentQuiz() {
  const { user, logout } = useContext(AuthContext);
  
  // Use the upgraded hook with a guaranteed 'In Lobby' handshake
  const { emit, lastMessage } = useWebSocket(user?.email, {
    student_id: user?.email,
    student_name: user?.name || "Anonymous",
    module: "Selecting...",
    current_question_text: "In Lobby",
    type: 'interval_update'
  });
  
  const [selectedModule, setSelectedModule] = useState(null); // 'maths' | 'logic'
  const [progressData, setProgressData] = useState(null);

  useEffect(() => {
    if (!user?.email) return;
    const fetchProgress = async () => {
      try {
        const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
        const response = await fetch(`${API_BASE}/api/student/progress?email=${user.email}`);
        if (response.ok) {
          const data = await response.json();
          setProgressData(data);
        }
      } catch (e) {
        console.error("Failed to fetch module progress data", e);
      }
    };
    fetchProgress();
  }, [user]);
  const [isFinished, setIsFinished] = useState(false);
  const [showHelpButton, setShowHelpButton] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [attempts, setAttempts] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [toastState, setToastState] = useState('Engaged'); // frozen at toast display time
  const [serverState, setServerState] = useState('Engaged'); // live — drives header badge only
  const [answeredSet, setAnsweredSet] = useState(new Set()); // Track correctly answered question indices
  
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [cumulativeIdleTime, setCumulativeIdleTime] = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);

  // ── ITS Hint System ──────────────────────────────────────────────────
  const [hint, setHint]                   = useState(null);
  const [hintLoading, setHintLoading]     = useState(false);
  const [hintError, setHintError]         = useState(null);
  const [hintHistory, setHintHistory]     = useState([]);  // persists full session
  const [scaffoldingLevel, setScaffoldingLevel] = useState(null);
  const [hintIntent, setHintIntent]       = useState(null);
  const [hintsUsedOnQuestion, setHintsUsedOnQuestion] = useState(0); // per-question counter
  const [totalHintsRequested, setTotalHintsRequested] = useState(0); // whole session counter

  const [isGenerating, setIsGenerating] = useState(false);
  const [adaptiveQuestions, setAdaptiveQuestions] = useState(null);

  const getActiveQuestions = () => {
    if (adaptiveQuestions) return adaptiveQuestions;
    return selectedModule === 'maths' ? mathsQuestions : logicQuestions;
  };

  const questions = getActiveQuestions();
  
  const timeOnQuestion = useRef(0);
  const idleTime = useRef(0);
  const lastTimerTickRef = useRef(Date.now()); // Wall-clock anchor for delta computation
  // Bug 2 Fix: Keep emit in a ref so the heartbeat interval never needs to re-subscribe
  const emitRef = useRef(null);
  const selectedModuleRef = useRef(null);
  const isFinishedRef = useRef(false);
  const prevStateRef = useRef('Engaged'); // tracks previous state for toast triggers


  // Keep all rapidly-changing values in refs so the heartbeat never restarts
  const currentIdxRef = useRef(currentIdx);
  const totalMistakesRef = useRef(totalMistakes);
  const attemptsRef = useRef(attempts);
  const cumulativeIdleTimeRef = useRef(cumulativeIdleTime);
  const rawCumulativeIdleRef = useRef(0); // Source of truth — never affected by React render cycles
  const scoreRef = useRef(score);
  const answeredSetRef = useRef(answeredSet); // For ML answeredCount proxy
  const totalHintsRequestedRef = useRef(0);  // ref so heartbeat can read latest value
  const questionsRef = useRef(questions);    // Keep active question set in sync for heartbeat

  // Sync all refs on every render (does NOT trigger re-renders or restart intervals)
  emitRef.current = emit;
  selectedModuleRef.current = selectedModule;
  isFinishedRef.current = isFinished;
  currentIdxRef.current = currentIdx;
  totalMistakesRef.current = totalMistakes;
  attemptsRef.current = attempts;
  cumulativeIdleTimeRef.current = cumulativeIdleTime;
  scoreRef.current = score;
  answeredSetRef.current = answeredSet;
  totalHintsRequestedRef.current = totalHintsRequested; // keep ref in sync for heartbeat
  questionsRef.current = questions; // Sync active set (Static OR Adaptive)

  // Handlers for idle time
  useEffect(() => {
    const resetIdle = () => { idleTime.current = 0; };
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('click', resetIdle);
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('click', resetIdle);
    }
  }, []);

  // Timer loop — wall-clock delta survives Chrome background tab throttling
  useEffect(() => {
    const timer = setInterval(() => {
      if (!selectedModule || isFinished) return;
      const now = Date.now();
      const delta = Math.max(1, Math.round((now - lastTimerTickRef.current) / 1000));
      lastTimerTickRef.current = now;
      timeOnQuestion.current += delta;
      idleTime.current += delta;
      if (idleTime.current > 1) {
        rawCumulativeIdleRef.current += delta;
        cumulativeIdleTimeRef.current = rawCumulativeIdleRef.current;
        setCumulativeIdleTime(rawCumulativeIdleRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedModule, isFinished]);

  const calculateMastery = (correctOverride, mistakesOverride, idleOverride) => {
    if (!selectedModule) return 0;
    const c = correctOverride !== undefined ? correctOverride : score.correct;
    const m = mistakesOverride !== undefined ? mistakesOverride : totalMistakes;
    const i = idleOverride !== undefined ? idleOverride : cumulativeIdleTime;
    
    const baseScore = (c / questions.length) * 100;
    const mistakePenalty = m * 1.5; 
    const idlePenalty = (i / 30) * 1; 
    return Math.max(0, Math.round(baseScore - mistakePenalty - idlePenalty));
  };

  // (Refs are now synced inline above — no extra useEffects needed)

  // Bug 2 Fix: Telemetry heartbeat — created ONCE, never restarts
  useEffect(() => {
    console.log("Telemetry Heartbeat Started (once).");
    const heartbeat = setInterval(() => {
      // Read all values from refs — no stale closures, no restarts
      const mod = selectedModuleRef.current;
      const finished = isFinishedRef.current;
      
      // NEW: If in lobby, send a lightweight presence packet so instructor knows we are back
      if (!mod && !finished) {
        emitRef.current({
          student_id: user?.email,
          student_name: user?.name,
          module: "Selecting...",
          current_question_text: "In Lobby",
          type: 'interval_update'
        });
        return;
      }

      if (!mod || finished) return;
      if (!questionsRef.current || questionsRef.current.length === 0) return;

      const q = questionsRef.current[currentIdxRef.current];
      if (!q) return;

      const c = scoreRef.current.correct;
      const m = totalMistakesRef.current;
      const i = cumulativeIdleTimeRef.current;
      const baseScore = (c / questionsRef.current.length) * 100;
      const mastery = Math.max(0, Math.round(baseScore - (m * 1.5) - (i / 30)));

      console.log("Emitting telemetry pulse...");
      emitRef.current(buildTelemetryPacket({
        student_id: user?.email,
        student_name: user?.name,
        module: mod,
        current_question_text: q.text,
        time_per_question: timeOnQuestion.current,
        attempt_count: attemptsRef.current,
        idle_time: idleTime.current,
        current_score: mastery / 100,
        totalMistakes: totalMistakesRef.current,
        totalIdleTime: cumulativeIdleTimeRef.current,
        answeredCount: answeredSetRef.current.size,
        totalHintsRequested: totalHintsRequestedRef.current,  // always current via ref
        type: 'interval_update'
      }));
    }, 5000);

    return () => {
      console.log("Telemetry Heartbeat Stopped.");
      clearInterval(heartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps — runs exactly once on mount

  // Tracks the last message we've already shown — prevents re-open on close
  const lastShownMsgRef = useRef('');

  // Reset hint DISPLAY only on question change — history stays alive across session
  useEffect(() => {
    setHint(null);
    setHintError(null);
    setHintsUsedOnQuestion(0); // reset per-question counter, NOT total
    // DO NOT reset hintHistory — GPT memory carries across all questions
  }, [currentIdx]);

  // ── LOCAL STATE BADGE + TOASTS (mirrors backend rules, updates every second) ──
  useEffect(() => {
    if (!selectedModule) return;

    const stateTimer = setInterval(() => {
      if (isFinishedRef.current) return;
      const idle = idleTime.current;
      const att  = attemptsRef.current;

      let newState;
      if      (idle > 60)               newState = 'Unengaged';
      else if (idle >= 30 || att >= 3)  newState = 'Struggling';
      else                              newState = 'Engaged';

      setServerState(newState);

      // On state TRANSITION: update toast + immediately push to backend
      // so the instructor dashboard syncs in real time (no 5s heartbeat lag)
      if (newState !== prevStateRef.current) {
        prevStateRef.current = newState;

        // 1. Toast
        if (newState === 'Struggling') {
          setToastState('Struggling');
          if (att >= 3)
            setToastMsg("You've tried this a few times. Hint: try breaking the problem into smaller steps!");
          else
            setToastMsg("You seem stuck. Take your time — or request a hint from your instructor.");
        } else if (newState === 'Unengaged') {
          setToastState('Unengaged');
          setToastMsg("You've been inactive for a while. Ready to continue? 👋");
        }
        // Engaged transition is silent (no toast)

        // 2. Immediate backend sync — so instructor dashboard reflects the change now
        const mod = selectedModuleRef.current;
        const q   = questionsRef.current[currentIdxRef.current];
        if (mod && q && emitRef.current) {
          emitRef.current(buildTelemetryPacket({
            student_id:           user?.email,
            student_name:         user?.name,
            module:               mod,
            current_question_text: q.text,
            attempt_count:        att,
            idle_time:            idle,
            current_score:        scoreRef.current.correct / questionsRef.current.length,
            totalMistakes:        totalMistakesRef.current,
            totalIdleTime:        cumulativeIdleTimeRef.current,
            answeredCount:        answeredSetRef.current.size,
            totalHintsRequested:  totalHintsRequestedRef.current,  // use ref — stale state closure bug fix
            type:                 'state_change',
          }));
        }
      }
    }, 1000);
    return () => clearInterval(stateTimer);
  }, [selectedModule, user?.id, user?.name, user?.email]);

  // Backend WS — only used for INSTRUCTOR HINT interventions now
  // (Badge and state-change toasts are handled locally above)
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'telemetry') return;
    // Instructor-sent hint arrives with {intervention: true, message: "..."}
    if (lastMessage.message && lastMessage.intervention) {
      setToastState('Engaged');
      setToastMsg(`💡 Instructor hint: ${lastMessage.message}`);
    }
  }, [lastMessage]);

  // ── ITS Hint Request ────────────────────────────────────────────────
  const requestHint = async () => {
    setHintLoading(true);
    // Do NOT clear hint here — keep old hint visible while next one loads
    setHintError(null);
    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
      const res = await fetch(`${API_BASE}/api/hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_text:     questions[currentIdxRef.current].text,
          module:            selectedModuleRef.current,
          attempt_count:     attemptsRef.current,
          current_score:     scoreRef.current.correct / questions.length,
          difficulty:        questions[currentIdxRef.current].difficulty || 'medium',
          total_mistakes:    totalMistakesRef.current,
          answered_count:    answeredSetRef.current.size,
          total_questions:   questions.length,
          hints_on_question: hintsUsedOnQuestion,  // escalation signal
          history:           hintHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Server error');

      setHint(data.hint);
      setScaffoldingLevel(data.scaffolding_level);
      setHintIntent(data.intent);

      // Increment counters — compute new values locally so we can use them in the emit
      const newHintsOnQ    = hintsUsedOnQuestion + 1;
      const newTotalHints  = totalHintsRequestedRef.current + 1;
      setHintsUsedOnQuestion(newHintsOnQ);
      setTotalHintsRequested(newTotalHints);
      totalHintsRequestedRef.current = newTotalHints; // update ref immediately (before next render)

      // Append to session history so GPT remembers across questions
      const userMsg = `Question: "${questions[currentIdxRef.current].text}" | Attempts: ${attemptsRef.current} | Hint #${newHintsOnQ} on this question | Module: ${selectedModuleRef.current}`;
      setHintHistory(prev => [
        ...prev,
        { role: 'user',      content: userMsg },
        { role: 'assistant', content: data.hint },
      ]);

      // ⚡ Emit immediately so the instructor dashboard updates NOW, not at the next 5s heartbeat
      const mod = selectedModuleRef.current;
      if (mod && emitRef.current) {
        emitRef.current(buildTelemetryPacket({
          student_id:          user?.email,
          student_name:        user?.name,
          module:              mod,
          current_question_text: questions[currentIdxRef.current].text,
          attempt_count:       attemptsRef.current,
          idle_time:           idleTime.current,
          current_score:       scoreRef.current.correct / questions.length,
          totalMistakes:       totalMistakesRef.current,
          totalIdleTime:       cumulativeIdleTimeRef.current,
          answeredCount:       answeredSetRef.current.size,
          totalHintsRequested: newTotalHints,
          type:                'hint_received',
        }));
      }
    } catch (err) {
      setHintError("Couldn't load hint. Please try again.");
    } finally {
      setHintLoading(false);
    }
  };

  const handleAnswer = (isCorrect) => {
    const currentQuestionAttempts = attempts + 1;
    setAttempts(currentQuestionAttempts);
    
    let nextMistakes = totalMistakes;
    if (!isCorrect) nextMistakes += 1;
    if (!isCorrect) setTotalMistakes(nextMistakes);
    
    // We update Mastery locally to avoid state-lag mismatch
    const nextCorrect = score.correct + (isCorrect ? 1 : 0);
    const nextMastery = calculateMastery(nextCorrect, nextMistakes, cumulativeIdleTime);
    
    emit(buildTelemetryPacket({
      student_id: user?.email,
      student_name: user?.name,
      module: selectedModule,
      current_question_text: questions[currentIdx].text,
      time_per_question: timeOnQuestion.current,
      attempt_count: currentQuestionAttempts,
      idle_time: idleTime.current,
      is_correct: isCorrect,
      current_score: nextMastery / 100,
      totalMistakes: nextMistakes,
      totalIdleTime: cumulativeIdleTime,
      totalHintsRequested: totalHintsRequestedRef.current,
      type: 'submit_answer'
    }));

    if (isCorrect) {
      // Celebrate immediately — no WS round-trip needed
      setToastState('Engaged');
      setToastMsg('Excellent! That’s correct, keep it up! 🎉');
      prevStateRef.current = 'Engaged'; // reset so next Struggling fires a new toast

      const entry = { question: questions[currentIdx].text, attempts: currentQuestionAttempts, time: timeOnQuestion.current };
      const nextHistory = [...sessionHistory, entry];
      setSessionHistory(nextHistory);
      
      // Mark this question as answered + reset notification tracker for the next question
      setAnsweredSet(prev => new Set([...prev, currentIdx]));
      lastShownMsgRef.current = ''; // Allow fresh notifications on the next question
      setScore(s => ({ correct: s.correct + 1, total: s.total + 1 }));
      timeOnQuestion.current = 0;
      setAttempts(0);
      setShowHelpButton(false);

      // Session ends when the student answers the LAST question in the list.
      // Skipped questions are allowed — we don't force them back.
      if (currentIdx === questions.length - 1) {
        setIsFinished(true);
        emit(buildTelemetryPacket({
           student_id: user?.email,
           student_name: user?.name,
           module: selectedModule,
           current_score: nextMastery / 100,
           history: nextHistory,
           totalMistakes: nextMistakes,
           totalIdleTime: cumulativeIdleTime,
           totalHintsRequested: totalHintsRequestedRef.current,
           type: 'session_complete'
        }));
      } else {
        // Advance forward to next unanswered question (no wrap-around)
        let nextIdx = null;
        for (let i = currentIdx + 1; i < questions.length; i++) {
          if (!answeredSet.has(i)) { nextIdx = i; break; }
        }
        if (nextIdx === null) {
          // All questions from here to end are answered — session complete
          setIsFinished(true);
          emit(buildTelemetryPacket({
             student_id: user?.email,
             student_name: user?.name,
             module: selectedModule,
             current_score: nextMastery / 100,
             history: nextHistory,
             totalMistakes: nextMistakes,
             totalIdleTime: cumulativeIdleTime,
             totalHintsRequested: totalHintsRequestedRef.current,
             type: 'session_complete'
          }));
        } else {
          setCurrentIdx(nextIdx);
          emit(buildTelemetryPacket({
            student_id: user?.email,
            student_name: user?.name,
            module: selectedModule,
            current_question_text: questions[nextIdx].text,
            time_per_question: 0,
            attempt_count: 0,
            idle_time: 0,
            current_score: nextMastery / 100,
            totalMistakes: nextMistakes,
            totalIdleTime: cumulativeIdleTime,
            totalHintsRequested: totalHintsRequestedRef.current,
            type: 'interval_update'
          }));
        }
      }
    }
  };

  const handleRequestHint = () => {
    emit(buildTelemetryPacket({
       student_id: user?.email,
       module: selectedModule,
       current_question_text: questions[currentIdx].text,
       type: 'request_hint'
    }));
    setShowHelpButton(false);
    setToastMsg("Help requested! Your instructor will guide you shortly.");
  };

  // Back to Lobby: resets all session state cleanly
  const handleBackToLobby = () => {
    setSelectedModule(null);
    setCurrentIdx(0);
    setScore({ correct: 0, total: 0 });
    setAttempts(0);
    setTotalMistakes(0);
    setCumulativeIdleTime(0);
    setSessionHistory([]);
    setAnsweredSet(new Set());
    setShowHelpButton(false);
    setToastMsg('');
    setIsFinished(false);
    setServerState('Engaged');
    // Reset ITS hint state
    setHint(null);
    setHintError(null);
    setHintHistory([]);
    setScaffoldingLevel(null);
    setHintIntent(null);
    setHintsUsedOnQuestion(0);
    setTotalHintsRequested(0);
    timeOnQuestion.current = 0;
    idleTime.current = 0;
    rawCumulativeIdleRef.current = 0;       // reset accumulated idle — was carrying over between sessions
    cumulativeIdleTimeRef.current = 0;      // keep ref in sync with state
    lastTimerTickRef.current = Date.now();  // reset wall-clock anchor for fresh delta computation
    lastShownMsgRef.current = '';
    // Announce return to lobby
    emit(buildTelemetryPacket({
      student_id: user?.email,
      student_name: user?.name || 'Anonymous',
      module: 'Selecting...',
      current_question_text: 'In Lobby',
      totalMistakes: 0,
      totalIdleTime: 0,
      totalHintsRequested: 0,
      type: 'interval_update'
    }));
  };

  // Skip question: jump to next unanswered question
  const handleSkip = () => {
    const total = questions.length;
    // Find the next unanswered question (wrapping around)
    for (let offset = 1; offset < total; offset++) {
      const nextIdx = (currentIdx + offset) % total;
      if (!answeredSet.has(nextIdx)) {
        setCurrentIdx(nextIdx);
        setAttempts(0);
        timeOnQuestion.current = 0;
        idleTime.current = 0;
        emit(buildTelemetryPacket({
          student_id: user?.email,
          student_name: user?.name,
          module: selectedModule,
          current_question_text: questions[nextIdx].text,
          idle_time: 0,
          attempt_count: 0,
          totalMistakes: totalMistakes,
          totalIdleTime: cumulativeIdleTime,
          totalHintsRequested: totalHintsRequested,
          type: 'interval_update'
        }));
        return;
      }
    }
    // All questions answered
    setIsFinished(true);
  };

  // Previous question
  const handlePrevious = () => {
    if (currentIdx === 0) return;
    const prevIdx = currentIdx - 1;
    setCurrentIdx(prevIdx);
    setAttempts(0);
    timeOnQuestion.current = 0;
    idleTime.current = 0;
    emit(buildTelemetryPacket({
      student_id: user?.email,
      student_name: user?.name,
      module: selectedModule,
      current_question_text: questions[prevIdx].text,
      idle_time: 0,
      attempt_count: 0,
      totalMistakes: totalMistakes,
      totalIdleTime: cumulativeIdleTime,
      totalHintsRequested: totalHintsRequested,
      type: 'interval_update'
    }));
  };

  const getBadgeColor = () => {
    if (isFinished) return '#6D597A'; 
    if (serverState === 'Unengaged') return 'var(--status-unengaged)';
    if (serverState === 'Struggling') return 'var(--status-struggling)';
    return 'var(--status-engaged)';
  };


  const startModule = async (mod, staticQuestions) => {
    // 1. Check if we should use adaptive questions
    const modProgress = progressData?.[mod];
    const hasHistory = modProgress && modProgress.total_sessions > 0;
    let fetchedQuestions = null;

    if (hasHistory) {
      setIsGenerating(true);
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
      try {
        const res = await fetch(`${API_BASE}/api/questions/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_email: user.email, module: mod })
        });
        const data = await res.json();
        if (data.mode === 'adaptive' && data.questions) {
          setAdaptiveQuestions(data.questions);
          fetchedQuestions = data.questions;
        }
      } catch (err) {
        console.error("Adaptive generation failed, falling back to static.", err);
      } finally {
        setIsGenerating(false);
      }
    }

    // Initialize session
    idleTime.current = 0;
    rawCumulativeIdleRef.current = 0;
    cumulativeIdleTimeRef.current = 0;
    lastTimerTickRef.current = Date.now();
    setSelectedModule(mod);
    
    // Announce start
    const startQ = (hasHistory && fetchedQuestions) ? fetchedQuestions[0].text : staticQuestions[0].text;
    emit(buildTelemetryPacket({ 
      student_id: user?.email, 
      module: mod, 
      current_question_text: startQ, 
      answeredCount: 0, 
      type: 'interval_update' 
    }));
  };


  if (isGenerating) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '2rem' }}>
        <div className="loading-spinner" style={{ border: '8px solid #f3f3f3', borderTop: '8px solid var(--primary-cyan)', borderRadius: '50%', width: '80px', height: '80px', animation: 'spin 1s linear infinite' }}></div>
        <h2 style={{ marginTop: '2rem', fontWeight: '800', color: '#0F172A' }}>Personalizing your experience...</h2>
        <p style={{ color: '#64748B', maxWidth: '400px', textAlign: 'center' }}>
          Our AI is analyzing your previous performance to build a question set tailored to your unique learning level.
        </p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!selectedModule) {
    let mathMastery = 0;
    let logicMastery = 0;
    let mathLevel = "Beginner";
    let logicLevel = "Beginner";
    let mathLastActive = "Just Started";
    let logicLastActive = "Just Started";

    if (progressData) {
      const setLevel = m => m >= 80 ? "Expert" : m >= 50 ? "Intermediate" : "Beginner";
      const parseDate = ds => {
        if (!ds) return "Just Started";
        try {
          const ls = new Date(ds);
          const diffInMins = Math.floor((new Date() - ls) / 60000);
          if (diffInMins < 1) return "Just now";
          if (diffInMins < 60) return `${diffInMins} min ago`;
          if (diffInMins < 1440) return `${Math.floor(diffInMins / 60)} hours ago`;
          return `${Math.floor(diffInMins / 1440)} days ago`;
        } catch(e) { return "Just Started"; }
      };

      if (progressData.maths) {
        mathMastery = Math.round(progressData.maths.max_mastery * 100);
        mathLevel = setLevel(mathMastery);
        mathLastActive = parseDate(progressData.maths.last_timestamp);
      }
      if (progressData.logic) {
        logicMastery = Math.round(progressData.logic.max_mastery * 100);
        logicLevel = setLevel(logicMastery);
        logicLastActive = parseDate(progressData.logic.last_timestamp);
      }
    }

    return (
      <div className="fade-in" style={{ padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto', textAlign: 'center', fontFamily: '"Inter", sans-serif' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>
          Your Learning Path
        </h1>
        <p style={{ color: '#64748B', marginBottom: '3rem', fontSize: '1.1rem' }}>
          Select a cognitive domain to begin your adaptive session
        </p>

        <style>{`
          .module-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2rem;
          }
          @media (min-width: 768px) {
            .module-grid { grid-template-columns: 1fr 1fr; }
          }
          .module-card {
            position: relative;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 24px;
            padding: 2.5rem;
            cursor: pointer;
            text-align: left;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.05);
          }
          .module-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 6px;
            background: transparent;
            transition: background 0.3s ease;
          }
          .math-card:hover {
            transform: scale(1.02);
            box-shadow: 0 0 35px rgba(61, 82, 160, 0.2);
            border-color: rgba(61, 82, 160, 0.2);
          }
          .math-card:hover::before { background: linear-gradient(90deg, #3D52A0, #5B73C7); }
          
          .logic-card:hover {
            transform: scale(1.02);
            box-shadow: 0 0 35px rgba(15, 118, 110, 0.2);
            border-color: rgba(15, 118, 110, 0.2);
          }
          .logic-card:hover::before { background: linear-gradient(90deg, #0F766E, #4ECDC4); }
        `}</style>

        <div className="module-grid">
          {/* ── Mathematics Card ── */}
          <div
            className="module-card math-card"
            onClick={() => startModule('maths', mathsQuestions)}
          >
            {/* Top Right Mini SVG Gauge */}
            <div style={{ position: 'absolute', top: '1.75rem', right: '1.75rem', width: '55px', height: '55px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3D52A0" strokeWidth="3" strokeDasharray={`${mathMastery}, 100`} strokeLinecap="round" />
                <text x="18" y="20.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#0F172A">{mathMastery}%</text>
              </svg>
            </div>

            <div style={{ paddingRight: '60px' }}>
              <div style={{ fontSize: '2rem', color: '#3D52A0', marginBottom: '1rem', background: 'rgba(61, 82, 160, 0.06)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>∑</div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0F172A', margin: '0 0 0.5rem 0' }}>Data Mathematics</h2>
              
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.8rem' }}>
                <span style={{ color: '#64748B', fontWeight: '600' }}>Last active: {mathLastActive}</span>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#CBD5E1' }} />
                <span style={{ background: 'rgba(61, 82, 160, 0.08)', color: '#3D52A0', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: '700' }}>{mathLevel}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
                {['Algebra', 'Calculus', 'Geometry'].map(t => (
                  <span key={t} style={{ background: 'white', color: '#64748B', border: '1px solid #E2E8F0', padding: '0.35rem 0.85rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>{t}</span>
                ))}
              </div>
            </div>
            <button style={{ background: 'linear-gradient(135deg, #3D52A0, #5B73C7)', color: 'white', border: 'none', borderRadius: '14px', padding: '1rem 1.5rem', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', width: '100%', transition: 'transform 0.2s', boxShadow: '0 6px 16px rgba(61, 82, 160, 0.2)' }} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
              Resume Module →
            </button>
          </div>

          {/* ── Logic Patterns Card ── */}
          <div
            className="module-card logic-card"
            onClick={() => startModule('logic', logicQuestions)}
          >
            {/* Top Right Mini SVG Gauge */}
            <div style={{ position: 'absolute', top: '1.75rem', right: '1.75rem', width: '55px', height: '55px' }}>
              <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#0F766E" strokeWidth="3" strokeDasharray={`${logicMastery}, 100`} strokeLinecap="round" />
                <text x="18" y="20.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#0F172A">{logicMastery}%</text>
              </svg>
            </div>

            <div style={{ paddingRight: '60px' }}>
              <div style={{ fontSize: '2rem', color: '#0F766E', marginBottom: '1rem', background: 'rgba(15, 118, 110, 0.06)', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬡</div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0F172A', margin: '0 0 0.5rem 0' }}>Logic Patterns</h2>
              
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.8rem' }}>
                <span style={{ color: '#64748B', fontWeight: '600' }}>Last active: {logicLastActive}</span>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#CBD5E1' }} />
                <span style={{ background: 'rgba(15, 118, 110, 0.08)', color: '#0F766E', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: '700' }}>{logicLevel}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
                {['Sequences', 'Riddles', 'Theory'].map(t => (
                  <span key={t} style={{ background: 'white', color: '#64748B', border: '1px solid #E2E8F0', padding: '0.35rem 0.85rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>{t}</span>
                ))}
              </div>
            </div>
            <button style={{ background: 'linear-gradient(135deg, #0F766E, #4ECDC4)', color: 'white', border: 'none', borderRadius: '14px', padding: '1rem 1.5rem', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', width: '100%', transition: 'transform 0.2s', boxShadow: '0 6px 16px rgba(15, 118, 110, 0.2)' }} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
              Start Module →
            </button>
          </div>

        </div>
      </div>
    );
  }

  if (isFinished) {
    const finalMastery = calculateMastery();
    
    // Core Palette
    const emerald = '#10B981';
    const amber   = '#F59E0B';
    const rose    = '#F43F5E';
    const slate50 = '#F8FAFC';
    
    const masteryColor = finalMastery >= 80 ? emerald : finalMastery >= 50 ? amber : rose;
    const masteryLabel = finalMastery >= 80 ? 'CERTIFIED PROFICIENT' : finalMastery >= 50 ? 'DEVELOPING' : 'NEEDS PRACTICE';

    // SVG Mastery Gauge math (Half Circle)
    const radius = 90;
    const circumference = Math.PI * radius; // Approx 282.74
    const strokeDashoffset = circumference - ((finalMastery / 100) * circumference);

    // Prepare chart data for the Velocity Trace
    const chartData = sessionHistory.map((entry, idx) => ({
       name: `Q${idx+1}`,
       time: entry.time || 0
    }));

    // Calculate Recoveries (Resilience) - Questions answered correctly after at least 1 mistake
    const recoveries = sessionHistory.filter(entry => entry.attempts > 1).length;

    return (
      <div className="fade-in" style={{ backgroundColor: slate50, padding: '32px', minHeight: '100vh', fontFamily: '"Inter", sans-serif' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* Header Navigation Options */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A', margin: 0 }}>Session Complete</h1>
            <div className="desktop-actions" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
               <style>{`
                 @media (max-width: 640px) { .desktop-actions { display: none !important; } }
               `}</style>
               <button onClick={handleBackToLobby} style={{ background: '#0F172A', color: 'white', borderRadius: '12px', padding: '0.8rem 1.5rem', fontWeight: '600', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                 Start New Session →
               </button>
               <button onClick={logout} style={{ background: 'white', color: '#64748B', borderRadius: '12px', padding: '0.8rem 1.5rem', fontWeight: '600', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                 Sign Out
               </button>
            </div>
          </div>

          {/* Bento Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }} className="bento-grid">
            <style>{`
              @media (min-width: 768px) {
                .bento-grid { grid-template-columns: 1fr 1fr !important; }
              }
            `}</style>
            
            {/* Left Column: Mastery Gauge */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '3.5rem 2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <div style={{ position: 'relative', width: '220px', height: '120px', display: 'flex', justifyContent: 'center' }}>
                   <svg width="220" height="120" viewBox="0 0 220 120">
                     <defs>
                       <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                         <stop offset="0%" stopColor="#10B981" />
                         <stop offset="100%" stopColor="#0F766E" />
                       </linearGradient>
                     </defs>
                     {/* Background Arc */}
                     <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="#F1F5F9" strokeWidth="20" strokeLinecap="round" />
                     {/* Foreground Arc */}
                     <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="url(#gaugeGradient)" strokeWidth="20" strokeLinecap="round" 
                       strokeDasharray={Math.PI * 90} 
                       strokeDashoffset={strokeDashoffset} 
                       style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
                     />
                   </svg>
                   {/* Center text inside the arc void */}
                   <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', textAlign: 'center' }}>
                     <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#94A3B8', marginBottom: '0.1rem' }}>Mastery Index</div>
                     <div style={{ fontSize: '3.2rem', fontWeight: '800', color: '#0F172A', lineHeight: '1', fontFamily: 'var(--font-mono)' }}>{finalMastery}%</div>
                   </div>
                 </div>
                 {/* Pill safely below the SVG arc */}
                 <div style={{ marginTop: '0.5rem', display: 'inline-block', background: masteryColor, color: 'white', padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                   {masteryLabel}
                 </div>
               </div>
            </div>

            {/* Right Column: 2x2 Metric Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px' }}>
              {/* Tile 1: Accuracy */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9' }}>
                 <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Accuracy</div>
                 <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0F172A', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>{score.correct} <span style={{ fontSize: '1.2rem', fontWeight: '600', color: '#94A3B8' }}>/ {questions.length}</span></div>
                 <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#10B981' }}>Correct</div>
              </div>

              {/* Tile 2: Mistakes */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    Mistakes {totalMistakes > 0 && <FiAlertCircle color={rose} size={16} />}
                 </div>
                 <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0F172A', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>{totalMistakes}</div>
                 <div style={{ fontSize: '0.85rem', fontWeight: '600', color: totalMistakes > 0 ? rose : '#94A3B8' }}>Errors</div>
              </div>

              {/* Tile 3: Efficiency */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9' }}>
                 <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Idle Time</div>
                 <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0F172A', fontFamily: 'var(--font-mono)' }}>{cumulativeIdleTime}s</div>
                 <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.35rem', fontWeight: '500' }}>Total session inactivity</div>
              </div>

              {/* Tile 4: Resilience */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9' }}>
                 <div style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>Resilience</div>
                 <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0F172A', fontFamily: 'var(--font-mono)' }}>{recoveries}</div>
                 <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '0.35rem', fontWeight: '500' }}>Real-time recoveries</div>
              </div>
            </div>

            {/* Session Velocity Trace */}
            <div style={{ gridColumn: '1 / -1', background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ color: '#0F172A', fontSize: '1.1rem', fontWeight: '800' }}>Session Velocity Trace</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366F1' }}></div>
                  Time per Question (s)
                </div>
              </div>
              <div style={{ width: '100%', height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8', fontWeight: 600 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8', fontWeight: 600 }} />
                    <Tooltip 
                      cursor={{ stroke: '#CBD5E1', strokeWidth: 1, strokeDasharray: '5 5' }} 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: '600' }} 
                      formatter={(value) => [`${value}s`, "Response Time"]} 
                    />
                    <Area type="monotone" dataKey="time" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorTime)" activeDot={{ r: 6, fill: '#4F46E5', stroke: 'white', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
          
          {/* Mobile Sticky Nav */}
          <div className="mobile-actions" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', padding: '1rem', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '0.5rem', zIndex: 10 }}>
               <style>{`
                 @media (min-width: 641px) { .mobile-actions { display: none !important; } }
               `}</style>
               <button onClick={handleBackToLobby} style={{ flex: 1, background: '#0F172A', color: 'white', borderRadius: '12px', padding: '1rem', fontWeight: '700', border: 'none', cursor: 'pointer' }}>
                 Start New Session
               </button>
               <button onClick={logout} style={{ background: '#F1F5F9', color: '#64748B', borderRadius: '12px', padding: '1rem', fontWeight: '700', border: 'none', cursor: 'pointer' }}>
                 Sign Out
               </button>
          </div>
          
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  const isCurrentAnswered = answeredSet.has(currentIdx);

  return (
    <>
      {/* Toast: uses frozen toastState so color never flips mid-display */}
      {toastMsg && <FeedbackToast message={toastMsg} state={toastState} onClose={() => setToastMsg('')} />}

      <div className="fade-in" style={{ padding: '3rem 2rem', maxWidth: '800px', margin: '0 auto' }}>
      {showHelpButton && (
        <div className="fade-in" style={{ position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 90 }}>
           <button 
             onClick={handleRequestHint} 
             className="btn-secondary" 
             style={{ background: 'white', color: 'var(--primary-orange)', border: '2px solid var(--primary-orange)', padding: '1rem 2rem', fontSize: '1rem', borderBottom: '4px solid #e18c18' }}>
             <FiLifeBuoy size={20} /> Request Hint from Instructor
           </button>
        </div>
      )}

      {/* ── HEADER CARD ── */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--secondary-cyan)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--primary-cyan)', fontSize: '1.5rem' }}>
            <FiUser />
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: 0, textTransform: 'capitalize' }}>{selectedModule} Map</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-light)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              <FiActivity color={getBadgeColor()} /> 
              <span style={{ color: getBadgeColor(), fontWeight: 'bold' }}>
                {!selectedModule ? 'Ready' : serverState}
              </span> {!selectedModule ? '— Select a module to start' : 'State'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-color)', padding: '0.75rem 1.5rem', borderRadius: '50px', fontWeight: 'bold', border: '1px solid #e2e8f0' }}>
            <FiAward size={24} color="var(--primary-orange)" />
            <span style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>{calculateMastery()}% Mastery</span>
          </div>
          {/* Back to Lobby button */}
          <button
            onClick={handleBackToLobby}
            title="Return to module selection"
            style={{ background: 'none', border: '2px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 1rem', color: 'var(--text-light)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', transition: '0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-cyan)'; e.currentTarget.style.color = 'var(--primary-cyan)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = 'var(--text-light)'; }}
          >
            ← Lobby
          </button>
          <button onClick={logout} className="btn-danger" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', width: 'auto' }}>
             Sign Out
          </button>
        </div>
      </div>
      
      {/* ── PROGRESS BAR with question dots ── */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ marginBottom: '0.5rem', background: '#e2e8f0', height: '12px', borderRadius: '20px', overflow: 'hidden' }}>
          <div style={{ width: `${(answeredSet.size / questions.length) * 100}%`, backgroundColor: 'var(--primary-cyan)', height: '100%', transition: 'width 0.4s ease', borderRadius: '20px' }}></div>
        </div>
        {/* Individual question dots */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {questions.map((_, i) => (
            <div key={i} title={`Question ${i + 1}${answeredSet.has(i) ? ' ✓' : ''}`} style={{
              width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold', border: '2px solid',
              borderColor: answeredSet.has(i) ? 'var(--primary-cyan)' : (i === currentIdx ? 'var(--primary-orange)' : '#e2e8f0'),
              background: answeredSet.has(i) ? 'var(--primary-cyan)' : (i === currentIdx ? '#fff0e0' : 'transparent'),
              color: answeredSet.has(i) ? '#fff' : (i === currentIdx ? 'var(--primary-orange)' : '#999'),
              cursor: 'default'
            }}>
              {answeredSet.has(i) ? '✓' : i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* ── NAVIGATION BUTTONS (Previous / Skip) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={handlePrevious}
          disabled={currentIdx === 0}
          style={{ background: 'none', border: '2px solid #e2e8f0', borderRadius: '10px', padding: '0.5rem 1.2rem', cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', opacity: currentIdx === 0 ? 0.4 : 1, fontWeight: 'bold', color: 'var(--text-light)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          ← Previous
        </button>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
          Question {currentIdx + 1} of {questions.length}
          {isCurrentAnswered && <span style={{ color: 'var(--primary-cyan)', marginLeft: '0.5rem' }}>✓ Already answered</span>}
        </span>
        {currentIdx === questions.length - 1 ? (
          // Last question — show "Done" instead of Skip
          <button
            onClick={() => {
              setIsFinished(true);
              emit(buildTelemetryPacket({
                student_id: user?.email,
                student_name: user?.name,
                module: selectedModule,
                current_score: calculateMastery() / 100,
                history: sessionHistory,
                totalMistakes,
                totalIdleTime: cumulativeIdleTime,
                totalHintsRequested: totalHintsRequestedRef.current,
                type: 'session_complete'
              }));
            }}
            style={{
              background: '#6D597A',
              border: '2px solid #6D597A',
              borderRadius: '10px',
              padding: '0.5rem 1.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: '#fff',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(109,89,122,0.3)',
              transition: '0.2s'
            }}
          >
            Done ✓
          </button>
        ) : (
          <button
            onClick={handleSkip}
            disabled={answeredSet.size >= questions.length - 1 && answeredSet.has(currentIdx)}
            style={{ background: 'none', border: '2px solid var(--primary-orange)', borderRadius: '10px', padding: '0.5rem 1.2rem', cursor: 'pointer', fontWeight: 'bold', color: 'var(--primary-orange)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            Skip for now →
          </button>
        )}
      </div>
      
      <QuizQuestion
        key={currentIdx}
        question={q}
        onAnswer={handleAnswer}
        attempts={attempts}
        hintSlot={
          <>
            {/* State A: No hint yet — show Ask button (with spinner if loading) */}
            {!hint && (
              <button
                onClick={requestHint}
                disabled={hintLoading || attempts === 0}
                className="hint-btn"
                style={{ opacity: attempts === 0 ? 0 : 1, pointerEvents: attempts === 0 ? 'none' : 'auto' }}
              >
                {hintLoading
                  ? <><span className="hint-spinner"/> Getting hint...</>
                  : <>💡 Ask for a hint</>
                }
              </button>
            )}

            {/* State B: Hint exists — card stays visible; secondary button at bottom of card */}
            {hint && (
              <div className={`hint-card hint-card--level-${scaffoldingLevel}`}>
                <div className="hint-card__header">
                  <span className="hint-icon">💡</span>
                  <span className="hint-label">
                    {hintIntent === 'Reassure'              && 'Take it easy 🤗'}
                    {hintIntent === 'Teach'                 && 'Let me explain 📖'}
                    {hintIntent === 'Guide Self-Correction' && 'Think about it 🤔'}
                    {hintIntent === 'Hint'                  && "Here's a clue 🔍"}
                    {hintIntent === 'Encourage'             && "You've got this 💪"}
                  </span>
                  <span style={{ fontSize: '11px', color: '#B45309', marginLeft: 'auto', marginRight: '8px', opacity: 0.8 }}>
                    Hint #{hintsUsedOnQuestion}
                  </span>
                  <button className="hint-dismiss" onClick={() => setHint(null)}>✕</button>
                </div>

                <p className="hint-text">{hint}</p>

                {/* ↓ Secondary button lives at the bottom of the card — exactly where
                       the student's eyes land after reading the hint */}
                <button
                  onClick={requestHint}
                  disabled={hintLoading}
                  className="hint-btn"
                  style={{ marginTop: '14px', width: '100%', justifyContent: 'center', fontSize: '13px', padding: '8px 16px' }}
                >
                  {hintLoading
                    ? <><span className="hint-spinner"/> Getting next hint...</>
                    : <>💡 Still confused? Get a simpler hint</>
                  }
                </button>
              </div>
            )}

            {hintError && <p className="hint-error">{hintError}</p>}
          </>
        }
      />
    </div>
    </>
  );
}
