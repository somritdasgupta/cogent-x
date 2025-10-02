/**
 * Session Information Component
 * Displays current session info and allows clearing session
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getSessionInfo, clearSession, hasSession } from "@/lib/session";
import { apiGet, apiDelete, API_ENDPOINTS } from "@/config/api";
import { Trash2, RefreshCw, Clock } from "lucide-react";

interface SessionStats {
  total_documents: number;
  total_chunks: number;
  created_at?: string;
  last_accessed?: string;
}

export function SessionInfo() {
  const { toast } = useToast();
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionInfo = getSessionInfo();

  const loadSessionStats = async () => {
    if (!hasSession()) return;

    try {
      setLoading(true);
      const response = await apiGet(API_ENDPOINTS.SESSION_INFO);

      if (response.ok) {
        const data = await response.json();
        if (data.exists) {
          setSessionStats({
            total_documents: data.total_documents || 0,
            total_chunks: data.total_chunks || 0,
            created_at: data.created_at,
            last_accessed: data.last_accessed,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load session stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    try {
      setLoading(true);

      // Try to delete session on backend
      try {
        await apiDelete(API_ENDPOINTS.SESSION_DELETE);
      } catch (error) {
        // Backend might return 404 if session doesn't exist, that's ok
        console.log("Backend session cleanup:", error);
      }

      // Clear local session
      clearSession();
      setSessionStats(null);

      toast({
        title: "Session Cleared",
        description:
          "Your session has been cleared. A new session will be created on your next action.",
      });

      // Reload the page to reinitialize everything
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Failed to clear session:", error);
      toast({
        title: "Error",
        description: "Failed to clear session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessionStats();
  }, []);

  if (!hasSession()) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Session</CardTitle>
            <CardDescription className="text-xs mt-1">
              Your private document workspace
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {sessionInfo.shortId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSessionStats}
            disabled={loading}
            className="flex-1"
          >
            <RefreshCw
              className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={loading}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all documents and data in your
                  current session. This action cannot be undone. A new session
                  will be created automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearSession}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear Session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Session Expiry Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
          <Clock className="h-3 w-3" />
          <span>Session expires after 24h of inactivity</span>
        </div>
      </CardContent>
    </Card>
  );
}
