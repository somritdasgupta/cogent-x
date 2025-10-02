/**
 * Session Management for RAG System
 *
 * Handles session ID storage and retrieval for document isolation.
 * Each user gets a unique session ID that isolates their documents
 * from other users for privacy and security.
 */

const SESSION_STORAGE_KEY = "rag_session_id";
const SESSION_EXPIRY_KEY = "rag_session_expiry";
const SESSION_TIMEOUT_HOURS = 24;

/**
 * Get the current session ID, or create a new one if none exists
 * @returns {string} The session ID
 */
export const getSessionId = (): string => {
  // Check if session exists and is not expired
  const existingId = localStorage.getItem(SESSION_STORAGE_KEY);
  const expiryTime = localStorage.getItem(SESSION_EXPIRY_KEY);

  if (existingId && expiryTime) {
    const expiry = new Date(expiryTime);
    if (expiry > new Date()) {
      // Session still valid, extend expiry
      updateSessionExpiry();
      console.log("[Session] Using existing session:", existingId);
      return existingId;
    } else {
      // Session expired, clear it
      console.log("[Session] Session expired, clearing:", existingId);
      clearSession();
    }
  }

  // No valid session, create new one
  const newId = createNewSession();
  console.log("[Session] Created new session:", newId);
  return newId;
};

/**
 * Create a new session ID and store it
 * @returns {string} The new session ID
 */
export const createNewSession = (): string => {
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  updateSessionExpiry();
  return sessionId;
};

/**
 * Update the session expiry time
 */
const updateSessionExpiry = (): void => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + SESSION_TIMEOUT_HOURS);
  localStorage.setItem(SESSION_EXPIRY_KEY, expiry.toISOString());
};

/**
 * Set the session ID (used when backend returns a new session ID)
 * @param {string} sessionId - The session ID to store
 */
export const setSessionId = (sessionId: string): void => {
  console.log("[Session] Backend returned new session ID:", sessionId);
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  updateSessionExpiry();
};

/**
 * Clear the current session
 */
export const clearSession = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_EXPIRY_KEY);
};

/**
 * Check if a session exists
 * @returns {boolean} True if a valid session exists
 */
export const hasSession = (): boolean => {
  const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  const expiryTime = localStorage.getItem(SESSION_EXPIRY_KEY);

  if (!sessionId || !expiryTime) {
    return false;
  }

  const expiry = new Date(expiryTime);
  return expiry > new Date();
};

/**
 * Get session expiry time
 * @returns {Date | null} The expiry date, or null if no session
 */
export const getSessionExpiry = (): Date | null => {
  const expiryTime = localStorage.getItem(SESSION_EXPIRY_KEY);
  return expiryTime ? new Date(expiryTime) : null;
};

/**
 * Get time remaining until session expires
 * @returns {number} Minutes remaining, or 0 if expired/no session
 */
export const getSessionTimeRemaining = (): number => {
  const expiry = getSessionExpiry();
  if (!expiry) return 0;

  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60))); // Convert to minutes
};

/**
 * Get session information for display
 * @returns Object with session details
 */
export const getSessionInfo = (): {
  id: string;
  shortId: string;
  exists: boolean;
  expiresAt: Date | null;
  minutesRemaining: number;
} => {
  const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  const expiry = getSessionExpiry();

  return {
    id: sessionId || "",
    shortId: sessionId ? sessionId.substring(0, 8) : "",
    exists: hasSession(),
    expiresAt: expiry,
    minutesRemaining: getSessionTimeRemaining(),
  };
};
