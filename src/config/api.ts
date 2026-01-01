import { getSessionId, setSessionId } from "@/lib/session";

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim() !== "") return envUrl.trim();
  if (import.meta.env.DEV) return "";
  console.error("CRITICAL: VITE_API_BASE_URL not set!");
  return "";
};

export const getApiDocsUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")}/api/docs`;
  }
  if (import.meta.env.DEV) return "http://localhost:8000/api/docs";
  return `${window.location.origin}/api/docs`;
};

export const API_ENDPOINTS = {
  HEALTH: "/api/v1/health",
  CONFIG: "/api/v1/config",
  KNOWLEDGE_BASES: "/api/v1/knowledge-bases",
  INGEST: "/api/v1/ingest",
  DATABASE_STATS: "/api/v1/database/stats",
  DATABASE_SOURCES: "/api/v1/database/sources",
  DATABASE_CLEAR: "/api/v1/database/clear",
  DATABASE_SOURCE: "/api/v1/database/source",
  DATABASE_SOURCE_CHUNKS: "/api/v1/database/source/chunks",
  ASK: "/api/v1/ask",
  SESSION_INFO: "/api/v1/session/info",
  SESSION_DELETE: "/api/v1/session",
} as const;

export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${endpoint}`;
};

export const buildApiUrlWithParams = (endpoint: string, params: Record<string, string>): string => {
  const url = buildApiUrl(endpoint);
  const queryString = new URLSearchParams(params).toString();
  return `${url}${queryString ? `?${queryString}` : ""}`;
};

export const getApiHeaders = (): Record<string, string> => {
  return {"Content-Type": "application/json", "X-Session-Id": getSessionId()};
};

export const processApiResponse = (response: Response): void => {
  const sessionId = response.headers.get("X-Session-Id");
  if (sessionId) setSessionId(sessionId);
};

export const apiRequest = async (endpoint: string, options: RequestInit = {}, customSessionId?: string): Promise<Response> => {
  const url = buildApiUrl(endpoint);
  const headers = new Headers(options.headers);
  headers.set("X-Session-Id", customSessionId || getSessionId());
  
  try {
    const response = await fetch(url, {...options, headers});
    if (!customSessionId) processApiResponse(response);
    return response;
  } catch (error) {
    console.error(`[API] Request failed for ${endpoint}:`, error);
    throw error;
  }
};

export const apiGet = async (endpoint: string, sessionId?: string): Promise<Response> => apiRequest(endpoint, {method: "GET"}, sessionId);

export const apiPost = async (endpoint: string, data?: unknown, sessionId?: string): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: data ? JSON.stringify(data) : undefined,
  }, sessionId);
};

export const apiPut = async (endpoint: string, data?: unknown): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: data ? JSON.stringify(data) : undefined,
  });
};

export const apiDelete = async (endpoint: string): Promise<Response> => apiRequest(endpoint, {method: "DELETE"});
