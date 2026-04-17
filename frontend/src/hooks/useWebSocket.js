import { useEffect, useRef, useState } from 'react';

export const useWebSocket = (studentId, initialPayload = null) => {
  const ws = useRef(null);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    if (!studentId) return;
    const isLocal = window.location.hostname === 'localhost';
    const wsProto = isLocal ? 'ws' : 'wss';
    const defaultUrl = isLocal ? 'localhost:8000' : window.location.host;
    const url = process.env.REACT_APP_WS_URL || `${wsProto}://${defaultUrl}`;
    
    console.log(`Connecting to ${url}/ws/${studentId}`);
    ws.current = new WebSocket(`${url}/ws/${studentId}`);

    ws.current.onmessage = (event) => {
      console.log('WS Message received:', event.data);
      setLastMessage(JSON.parse(event.data));
    };

    ws.current.onopen = () => {
      console.log("WS Connected - Handshake Started...");
      // 1. Mandatory Identity Check
      ws.current.send(JSON.stringify({
          type: "authenticate",
          token: localStorage.getItem('lme_token')
      }));

      // 2. Telemetry Presence (With Safety Buffer)
      if (initialPayload) {
        setTimeout(() => {
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log("Sending Handshake Telemetry:", initialPayload);
            ws.current.send(JSON.stringify(initialPayload));
          }
        }, 500);
      }
    };
    
    ws.current.onclose = (e) => {
      console.log("WS Disconnected", e.code);
      if (e.code === 1008) {
        // Explicit Backend Authentication Failure (e.g. Server restart + Expired JWT)
        console.warn("WebSocket Auth rejected. Clearing session.");
        localStorage.removeItem('lme_token');
        window.location.href = '/login';
      }
    };
    ws.current.onerror = (e) => console.error("WS Error:", e);

    return () => {
      if (ws.current) ws.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]); // Only reconnect if studentId changes

  const emit = (data) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log("Emitting telemetry:", data);
      ws.current.send(JSON.stringify(data));
    }
  };

  return { emit, lastMessage, readyState: ws.current?.readyState };
};
