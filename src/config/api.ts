/**
 * API Configuration
 * Centralized configuration for all API endpoints
 * Automatically derives the base URL based on environment
 */

import { getSessionId, setSessionId } from "@/lib/session";

// Get the base URL for API calls
// IMPORTANT: In production, VITE_API_BASE_URL MUST be set in Render environment variables
// Both frontend and backend are on different containers with different URLs
export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  if (envUrl && envUrl.trim() !== "") {
    return envUrl.trim();
  }

  // In development, return empty string to use Vite proxy
  if (import.meta.env.DEV) {
    return "";
  }

  // In production, if env var is missing, this will cause errors
  // Make sure VITE_API_BASE_URL is set in Render dashboard
  console.error(
    "CRITICAL: VITE_API_BASE_URL not set! Backend calls will fail."
  );
  return "";
};

// Get the full API docs URL (opens in new tab, so needs full URL)
export const getApiDocsUrl = (): string => {
  // Check if we have an environment variable set
  if (import.meta.env.VITE_API_BASE_URL) {
    return `${import.meta.env.VITE_API_BASE_URL}/api/docs`;
  }

  // In development, the backend is on port 8000
  // FastAPI now serves docs at /api/docs
  if (import.meta.env.DEV) {
    return "http://localhost:8000/api/docs";
  }

  // In production, assume API docs are at /api/docs on the same origin
  return `${window.location.origin}/api/docs`;
};

// API Endpoints
export const API_ENDPOINTS = {
  // Health & Status
  HEALTH: "/api/v1/health",
  CONFIG: "/api/v1/config",

  // Knowledge Base
  KNOWLEDGE_BASES: "/api/v1/knowledge-bases",
  INGEST: "/api/v1/ingest",

  // Database
  DATABASE_STATS: "/api/v1/database/stats",
  DATABASE_SOURCES: "/api/v1/database/sources",
  DATABASE_CLEAR: "/api/v1/database/clear",
  DATABASE_SOURCE: "/api/v1/database/source",
  DATABASE_SOURCE_CHUNKS: "/api/v1/database/source/chunks",

  // Query
  ASK: "/api/v1/ask",
  TRANSCRIBE: "/api/v1/transcribe",
  TEXT_TO_SPEECH: "/api/v1/text-to-speech",

  // Session
  SESSION_INFO: "/api/v1/session/info",
  SESSION_DELETE: "/api/v1/session",
} as const;

/**
 * Build a full API URL with the base URL and endpoint
 * @param endpoint - The API endpoint (use API_ENDPOINTS constants)
 * @returns Full URL for the API call
 */
export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  // Remove trailing slash from base URL to prevent double slashes
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${endpoint}`;
};

/**
 * Build a URL with query parameters
 * @param endpoint - The API endpoint
 * @param params - Query parameters as key-value pairs
 * @returns Full URL with query parameters
 */
export const buildApiUrlWithParams = (
  endpoint: string,
  params: Record<string, string>
): string => {
  const url = buildApiUrl(endpoint);
  const queryString = new URLSearchParams(params).toString();
  return `${url}${queryString ? `?${queryString}` : ""}`;
};

/**
 * Get default headers including session ID for API requests
 * @returns Headers object with session ID
 */
export const getApiHeaders = (): Record<string, string> => {
  const sessionId = getSessionId();
  return {
    "Content-Type": "application/json",
    "X-Session-Id": sessionId,
  };
};

/**
 * Process API response and update session ID if provided
 * @param response - Fetch response object
 */
export const processApiResponse = (response: Response): void => {
  const sessionId = response.headers.get("X-Session-Id");
  if (sessionId) {
    setSessionId(sessionId);
  }
};

/**
 * Make an API request with automatic session handling
 * @param endpoint - The API endpoint
 * @param options - Fetch options (method, body, etc.)
 * @returns Promise with the response
 */
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const url = buildApiUrl(endpoint);
  const sessionId = getSessionId();

  console.log(
    `[API] ${options.method || "GET"} ${endpoint} with session:`,
    sessionId
  );

  // Merge headers with session ID
  const headers = new Headers(options.headers);
  headers.set("X-Session-Id", sessionId);

  // Make the request
  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log(
    `[API] Response from ${endpoint}:`,
    response.status,
    "Session header:",
    response.headers.get("X-Session-Id")
  );

  // Process response to update session ID if backend returns a new one
  processApiResponse(response);

  return response;
};

/**
 * Make a GET request with session handling
 */
export const apiGet = async (endpoint: string): Promise<Response> => {
  return apiRequest(endpoint, { method: "GET" });
};

/**
 * Make a POST request with session handling
 */
export const apiPost = async (
  endpoint: string,
  data?: unknown
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * Make a PUT request with session handling
 */
export const apiPut = async (
  endpoint: string,
  data?: unknown
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * Make a DELETE request with session handling
 */
export const apiDelete = async (endpoint: string): Promise<Response> => {
  return apiRequest(endpoint, { method: "DELETE" });
};
