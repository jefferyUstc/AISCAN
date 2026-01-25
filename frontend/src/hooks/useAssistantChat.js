import { useEffect, useState, useRef } from "react";
import { getUserId, getSessionId } from "../utils/userIdGenerator.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export function useAssistantChat() {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionMessages, setSessionMessages] = useState([]);
  const controllerRef = useRef(null);
  const userIdRef = useRef(getUserId());
  const sessionIdRef = useRef(getSessionId());

  useEffect(() => {
    const loadSessionMessages = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/assistant/session/${sessionIdRef.current}/messages?user_id=${userIdRef.current}`);
        if (response.ok) {
          const data = await response.json();
          setSessionMessages(data.messages || []);
        } else {
          setSessionMessages([{
            id: "assistant-welcome",
            role: "assistant",
            content: "Hi! I'm your AISCAN assistant. Ask me to highlight cell populations, summarize gene expression, or run differential expression analyses.",
            timestamp: new Date().toISOString(),
          }]);
        }
      } catch {
        setSessionMessages([{
          id: "assistant-welcome",
          role: "assistant",
          content: "Hi! I'm your AISCAN assistant. Ask me to highlight cell populations, summarize gene expression, or run differential expression analyses.",
          timestamp: new Date().toISOString(),
        }]);
      }
    };

    loadSessionMessages();

    return () => {
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  const sendMessage = async (input, context = {}) => {
    if (!input.trim()) return;
    
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setSessionMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const payload = {
        user_id: userIdRef.current,
        session_id: sessionIdRef.current,
        message: input.trim(),
        context,
      };
      controllerRef.current = new AbortController();
      const response = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply || "I couldn't generate a response just now.",
        timestamp: new Date().toISOString(),
        annotations: data.annotations || null,
      };
      setSessionMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const fallback = {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: `There was a problem reaching the assistant: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
      setSessionMessages(prev => [...prev, fallback]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = () => {
    setSessionMessages([{
      id: "assistant-welcome",
      role: "assistant",
      content: "Hi! I'm your AISCAN assistant. Ask me to highlight cell populations, summarize gene expression, or run differential expression analyses.",
      timestamp: new Date().toISOString(),
    }]);
    sessionIdRef.current = getSessionId();
  };

  const getUserInfo = () => ({
    userId: userIdRef.current,
    sessionId: sessionIdRef.current,
  });

  return {
    messages: sessionMessages,
    isLoading,
    sendMessage,
    clearSession,
    getUserInfo,
  };
}
