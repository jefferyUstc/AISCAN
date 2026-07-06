import { useEffect, useState, useRef } from "react";
import { getUserId, getSessionId } from "../utils/userIdGenerator.js";
import { apiGet, apiPost } from "../api/client.js";

const WELCOME_TEXT =
  "Hi! I'm your AISCAN assistant. Ask me to highlight cell populations, summarize gene expression, or run differential expression analyses.";

function makeWelcomeMessage() {
  return {
    id: "assistant-welcome",
    role: "assistant",
    content: WELCOME_TEXT,
    timestamp: new Date().toISOString(),
  };
}

export function useAssistantChat({ onAssistantMessage } = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionMessages, setSessionMessages] = useState([]);
  const controllerRef = useRef(null);
  const userIdRef = useRef(getUserId());
  const sessionIdRef = useRef(getSessionId());
  const onAssistantMessageRef = useRef(onAssistantMessage);
  onAssistantMessageRef.current = onAssistantMessage;

  useEffect(() => {
    let ignore = false;
    const loadSessionMessages = async () => {
      try {
        const data = await apiGet(
          `/api/assistant/session/${sessionIdRef.current}/messages`,
          { user_id: userIdRef.current }
        );
        if (!ignore) setSessionMessages(data.messages?.length ? data.messages : [makeWelcomeMessage()]);
      } catch {
        if (!ignore) setSessionMessages([makeWelcomeMessage()]);
      }
    };

    loadSessionMessages();

    return () => {
      ignore = true;
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
    setSessionMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    controllerRef.current = new AbortController();
    try {
      const data = await apiPost("/api/assistant/chat", {
        body: {
          user_id: userIdRef.current,
          session_id: sessionIdRef.current,
          message: input.trim(),
          context,
        },
        signal: controllerRef.current.signal,
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply || "I couldn't generate a response just now.",
        timestamp: new Date().toISOString(),
        annotations: data.annotations || null,
      };
      setSessionMessages((prev) => [...prev, assistantMessage]);
      onAssistantMessageRef.current?.(assistantMessage);
    } catch (error) {
      setSessionMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: `There was a problem reaching the assistant: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = () => {
    setSessionMessages([makeWelcomeMessage()]);
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
