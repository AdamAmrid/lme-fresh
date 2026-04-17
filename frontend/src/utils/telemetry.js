/**
 * buildTelemetryPacket — Standardizes every telemetry payload sent over WebSocket.
 * Adds a timestamp automatically. All other fields are passed through from metrics.
 *
 * Key fields expected by the backend ML pipeline:
 *   answeredCount  — number of questions correctly answered so far (drives submission_rate proxy)
 *   idle_time      — seconds since last user interaction
 *   attempt_count  — attempts on the current question
 *   current_score  — mastery index (0.0–1.0)
 *   is_correct     — boolean, only on submit_answer events
 */
export const buildTelemetryPacket = (metrics) => {
  return {
    ...metrics,
    timestamp: new Date().toISOString(),
  };
};
