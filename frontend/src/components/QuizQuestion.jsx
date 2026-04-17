import React, { useState } from 'react';

const DIFFICULTY_STYLE = {
  easy:   { bg: '#DCFCE7', color: '#166534', label: '🟢 Easy' },
  medium: { bg: '#FEF9C3', color: '#854D0E', label: '🟡 Medium' },
  hard:   { bg: '#FEE2E2', color: '#991B1B', label: '🔴 Hard' },
};

export default function QuizQuestion({ question, onAnswer, attempts, hintSlot }) {
  const [selected, setSelected]  = useState(null);  // index of clicked option
  const [feedback, setFeedback]  = useState(null);  // 'correct' | 'wrong'
  const [locked, setLocked]      = useState(false);

  if (!question) return <div>Loading...</div>;

  const diff = DIFFICULTY_STYLE[question.difficulty?.toLowerCase()] || DIFFICULTY_STYLE.medium;

  const handleClick = (opt, idx) => {
    if (locked) return;
    const isCorrect = opt === question.correct;
    setSelected(idx);
    setFeedback(isCorrect ? 'correct' : 'wrong');
    setLocked(true);

    if (isCorrect) {
      // Correct: small delay so the user sees the green flash before advancing
      setTimeout(() => {
        onAnswer(true);
        setSelected(null);
        setFeedback(null);
        setLocked(false);
      }, 600);
    } else {
      // Wrong: shake, then unlock so the student can try again
      setTimeout(() => {
        setSelected(null);
        setFeedback(null);
        setLocked(false);
      }, 850);
      onAnswer(false);
    }
  };

  const getOptionClass = (idx) => {
    if (selected !== idx) return 'quiz-option';
    if (feedback === 'correct') return 'quiz-option correct correct-pop';
    if (feedback === 'wrong')   return 'quiz-option wrong wrong-shake';
    return 'quiz-option selected';
  };

  return (
    <div className="card fade-in" style={{ padding: '2.5rem' }}>

      {/* Header row: difficulty + attempts counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <span style={{
          background: diff.bg, color: diff.color,
          fontWeight: '700', fontSize: '0.82rem',
          padding: '0.3rem 0.85rem', borderRadius: '20px',
          letterSpacing: '0.04em',
        }}>
          {diff.label}
        </span>

        {attempts > 0 && (
          <span style={{
            color: '#EF4444', fontWeight: '700', fontSize: '0.88rem',
            display: 'flex', alignItems: 'center', gap: '0.35rem',
          }}>
            ⚠ {attempts} failed attempt{attempts > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Question text */}
      <h3 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '1.5rem',
        color: 'var(--color-dark)',
        marginBottom: '2rem',
        lineHeight: '1.5',
        fontWeight: '400',
      }}>
        {question.text}
      </h3>

      {/* Hint slot — ITS hint card injected by parent StudentQuiz */}
      {hintSlot}

      {/* Answer options — 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {question.options.map((opt, i) => (
          <button
            key={i}
            className={getOptionClass(i)}
            onClick={() => handleClick(opt, i)}
            disabled={locked && selected !== i}
          >
            {opt}
            {/* Inline icon when result is known */}
            {selected === i && feedback === 'correct' && (
              <span style={{ marginLeft: 'auto', paddingLeft: '0.5rem' }}>✓</span>
            )}
            {selected === i && feedback === 'wrong' && (
              <span style={{ marginLeft: 'auto', paddingLeft: '0.5rem' }}>✗</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
