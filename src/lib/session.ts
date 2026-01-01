const SESSION_STORAGE_KEY = "rag_session_id";
const SESSION_EXPIRY_KEY = "rag_session_expiry";
const SESSION_TIMEOUT_HOURS = 24;

const updateSessionExpiry = (): void => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + SESSION_TIMEOUT_HOURS);
  localStorage.setItem(SESSION_EXPIRY_KEY, expiry.toISOString());
};

export const getSessionId = (): string => {
  const existingId = localStorage.getItem(SESSION_STORAGE_KEY);
  const expiryTime = localStorage.getItem(SESSION_EXPIRY_KEY);
  
  if (existingId && expiryTime) {
    const expiry = new Date(expiryTime);
    if (expiry > new Date()) {
      updateSessionExpiry();
      return existingId;
    }
    clearSession();
  }
  
  return createNewSession();
};

export const createNewSession = (): string => {
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  updateSessionExpiry();
  return sessionId;
};

export const setSessionId = (sessionId: string): void => {
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  updateSessionExpiry();
};

export const clearSession = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(SESSION_EXPIRY_KEY);
};

export const hasSession = (): boolean => {
  const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  const expiryTime = localStorage.getItem(SESSION_EXPIRY_KEY);
  if (!sessionId || !expiryTime) return false;
  return new Date(expiryTime) > new Date();
};

export const getSessionExpiry = (): Date | null => {
  const expiryTime = localStorage.getItem(SESSION_EXPIRY_KEY);
  return expiryTime ? new Date(expiryTime) : null;
};

export const getSessionTimeRemaining = (): number => {
  const expiry = getSessionExpiry();
  if (!expiry) return 0;
  const diff = expiry.getTime() - new Date().getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60)));
};

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

export const setConversationSession = (conversationId: string, sessionId: string): void => {
  localStorage.setItem(`conv_session_${conversationId}`, sessionId);
};

export const getConversationSession = (conversationId: string): string | null => {
  return localStorage.getItem(`conv_session_${conversationId}`);
};

export const createConversationSession = (conversationId: string): string => {
  const sessionId = crypto.randomUUID();
  setConversationSession(conversationId, sessionId);
  return sessionId;
};
