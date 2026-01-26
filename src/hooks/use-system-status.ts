import { useState, useEffect, useCallback, useRef } from "react";
import { API_ENDPOINTS, apiGet } from "@/config/api";

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

interface SystemConfig {
  isConfigured: boolean;
  hasDocuments: boolean;
}

/**
 * Centralized hook for system status management
 * Prevents duplicate API calls and ensures consistent state across components
 */
export function useSystemStatus(pollInterval: number = 30000) {
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });

  const [config, setConfig] = useState<SystemConfig>({
    isConfigured: false,
    hasDocuments: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const checkStatus = useCallback(async () => {
    try {
      const [healthResponse, statsResponse, configResponse] = await Promise.all(
        [
          apiGet(API_ENDPOINTS.HEALTH),
          apiGet(API_ENDPOINTS.DATABASE_STATS),
          apiGet(API_ENDPOINTS.CONFIG),
        ],
      );

      if (!isMountedRef.current) return;

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        setStatus((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(healthData)) {
            return healthData;
          }
          return prev;
        });
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setConfig((prev) => ({
          ...prev,
          hasDocuments: (statsData.total_documents || 0) > 0,
        }));
      }

      if (configResponse.ok) {
        const configData = await configResponse.json();
        const hasValidConfig = !!(
          configData.openai_api_key ||
          configData.gemini_api_key ||
          configData.ollama_base_url
        );
        setConfig((prev) => ({
          ...prev,
          isConfigured: hasValidConfig,
        }));
      }

      setIsLoading(false);
    } catch (error) {
      if (!isMountedRef.current) return;

      setStatus({
        backend: false,
        llm: false,
        vectorDB: false,
      });
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    checkStatus();

    if (pollInterval > 0) {
      intervalRef.current = setInterval(checkStatus, pollInterval);
    }

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkStatus, pollInterval]);

  const isSystemReady = status.backend && status.llm && status.vectorDB;

  return {
    status,
    config,
    isLoading,
    isSystemReady,
    refresh,
  };
}
