// Anonymous identity for session management. A random UUID persisted in storage
// is sufficient and privacy-preserving; the previous canvas fingerprint was both
// over-engineered and unreliable (it drifts across browser/OS updates).

const USER_KEY = "aiscan_user_id";
const SESSION_KEY = "aiscan_session_id";

function readOrCreate(storage, key, factory) {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const value = factory();
  storage.setItem(key, value);
  return value;
}

// Persistent per-browser id.
export function getUserId() {
  return readOrCreate(localStorage, USER_KEY, () => `user_${crypto.randomUUID()}`);
}

// Per-tab-session id.
export function getSessionId() {
  return readOrCreate(sessionStorage, SESSION_KEY, () => `sess_${crypto.randomUUID()}`);
}

export function clearStoredIds() {
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function getUserInfo() {
  return {
    userId: getUserId(),
    sessionId: getSessionId(),
  };
}
