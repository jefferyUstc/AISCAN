/**
 * User ID generation utilities for anonymous session management
 */

/**
 * Generate a device fingerprint based on available browser information
 * @returns {string} A semi-persistent device fingerprint
 */
function generateDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('Device fingerprint', 2, 2);

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
    navigator.hardwareConcurrency || 'unknown',
    navigator.deviceMemory || 'unknown'
  ].join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Generate a random session ID
 * @returns {string} A random session identifier
 */
function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Get or create a persistent user ID
 * @returns {string} A persistent user ID
 */
export function getUserId() {
  const STORAGE_KEY = 'aiscan_user_id';

  // Try to get existing user ID from localStorage
  let userId = localStorage.getItem(STORAGE_KEY);

  if (!userId) {
    // Generate new user ID based on device fingerprint + random component
    const fingerprint = generateDeviceFingerprint();
    const randomComponent = Math.random().toString(36).substr(2, 6);
    userId = `user_${fingerprint}_${randomComponent}`;

    // Store in localStorage for persistence
    try {
      localStorage.setItem(STORAGE_KEY, userId);
    } catch (error) {
      console.warn('Could not store user ID in localStorage:', error);
      // Fallback to session-only ID
      userId = `temp_${fingerprint}_${randomComponent}`;
    }
  }

  return userId;
}

/**
 * Get or create a session ID for the current browser session
 * @returns {string} A session identifier
 */
export function getSessionId() {
  const STORAGE_KEY = 'aiscan_session_id';

  // Try to get existing session ID from sessionStorage
  let sessionId = sessionStorage.getItem(STORAGE_KEY);

  if (!sessionId) {
    sessionId = generateSessionId();

    try {
      sessionStorage.setItem(STORAGE_KEY, sessionId);
    } catch (error) {
      console.warn('Could not store session ID in sessionStorage:', error);
    }
  }

  return sessionId;
}

/**
 * Clear stored user and session IDs (for testing or reset purposes)
 */
export function clearStoredIds() {
  try {
    localStorage.removeItem('aiscan_user_id');
    sessionStorage.removeItem('aiscan_session_id');
  } catch (error) {
    console.warn('Could not clear stored IDs:', error);
  }
}

/**
 * Get user info for debugging
 * @returns {object} User identification information
 */
export function getUserInfo() {
  return {
    userId: getUserId(),
    sessionId: getSessionId(),
    fingerprint: generateDeviceFingerprint(),
    timestamp: new Date().toISOString()
  };
}
