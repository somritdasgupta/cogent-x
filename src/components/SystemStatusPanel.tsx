import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { API_ENDPOINTS, apiGet } from "@/config/api";

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

export const SystemStatusPanel = ({
  onConfigChange,
}: {
  onConfigChange?: number;
}) => {
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });

  // Uptime Robot status page URL - only show button if configured
  const uptimeStatusPageUrl = import.meta.env.VITE_UPTIME_STATUS_PAGE;

  const checkStatus = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.HEALTH);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Health check failed:", error);
      setStatus({
        backend: false,
        llm: false,
        vectorDB: false,
      });
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Re-check status immediately when config changes
  useEffect(() => {
    if (onConfigChange) {
      checkStatus();
    }
  }, [onConfigChange]);

  const isSystemReady = status.backend && status.llm && status.vectorDB;

  const handleOpenStatusPage = () => {
    window.open(uptimeStatusPageUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg">System Status</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 px-4 sm:px-6">
        <div className="flex items-center justify-center gap-2">
          {isSystemReady ? (
            <Badge className="bg-success text-success-foreground">
              <CheckCircle className="mr-1 h-3 w-3" />
              System Ready
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
              System Unavailable
            </Badge>
          )}
        </div>

        {uptimeStatusPageUrl && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleOpenStatusPage}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Uptime Status
            </Button>
            <Separator />
          </>
        )}

        <div className="text-xs text-center font-medium text-muted-foreground">
          Component Status
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="flex justify-between items-center p-2 rounded-md bg-muted/50">
            <span className="font-medium">Backend API</span>
            {status.backend ? (
              <Badge
                variant="outline"
                className="bg-success/10 text-success border-success/20"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Online
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/20"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
          </div>
          <div className="flex justify-between items-center p-2 rounded-md bg-muted/50">
            <span className="font-medium">LLM Service</span>
            {status.llm ? (
              <Badge
                variant="outline"
                className="bg-success/10 text-success border-success/20"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Online
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/20"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
          </div>
          <div className="flex justify-between items-center p-2 rounded-md bg-muted/50">
            <span className="font-medium">Vector DB</span>
            {status.vectorDB ? (
              <Badge
                variant="outline"
                className="bg-success/10 text-success border-success/20"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Online
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/20"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                Offline
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
