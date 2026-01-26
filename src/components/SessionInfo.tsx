import { useState, useEffect, useCallback } from "react";
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
import { apiGet, apiDelete, apiPost, API_ENDPOINTS } from "@/config/api";
import { Trash2, RefreshCw, Clock, FileText, RotateCw } from "lucide-react";

interface SessionStats {
  total_documents: number;
  total_chunks: number;
  created_at?: string;
  last_accessed?: string;
  knowledge_bases?: string[];
}

interface SessionInfoProps {
  onRefresh?: () => void;
}

export function SessionInfo({ onRefresh }: SessionInfoProps) {
  const { toast } = useToast();
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
  const sessionInfo = getSessionInfo();

  const loadSessionStats = useCallback(async () => {
    if (!hasSession()) return;
    try {
      setLoading(true);
      const [sessionResponse, kbResponse] = await Promise.all([
        apiGet(API_ENDPOINTS.SESSION_INFO),
        apiGet(API_ENDPOINTS.KNOWLEDGE_BASES),
      ]);

      if (sessionResponse.ok) {
        const data = await sessionResponse.json();
        const kbData = kbResponse.ok ? await kbResponse.json() : null;

        if (data.exists) {
          setSessionStats({
            total_documents: data.total_documents || 0,
            total_chunks: data.total_chunks || 0,
            created_at: data.created_at,
            last_accessed: data.last_accessed,
            knowledge_bases: kbData?.knowledge_bases || [],
          });
        }
      }
    } catch (error) {
      setSessionStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClearSession = useCallback(async () => {
    if (loading) return;
    try {
      setLoading(true);
      try {
        await apiDelete(API_ENDPOINTS.SESSION_DELETE);
      } catch (error) {
        // Ignore API errors
      }
      clearSession();
      setSessionStats(null);
      toast({
        title: "Session Cleared",
        description:
          "Your session has been cleared. A new session will be created on your next action.",
        className: "border-green-500/50 bg-green-50 dark:bg-green-950/30",
      });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [loading, toast]);

  // Load stats once on mount
  useEffect(() => {
    if (hasSession() && !sessionStats) {
      loadSessionStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (!hasSession()) return null;

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-slate-300">
              Session
            </CardTitle>
            <CardDescription className="text-xs mt-1 text-slate-400">
              Your private document workspace
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="font-mono text-xs bg-slate-800 border-slate-600 text-sky-400"
          >
            {sessionInfo.shortId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Document List */}
        {sessionStats?.knowledge_bases &&
          sessionStats.knowledge_bases.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-400" />
                Ingested Documents
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {sessionStats.knowledge_bases.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded bg-slate-800/50 border border-slate-700 text-slate-300 group"
                  >
                    <span className="truncate flex-1" title={doc}>
                      {doc}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletingDoc === doc}
                        onClick={async () => {
                          try {
                            setDeletingDoc(doc);
                            await apiPost(API_ENDPOINTS.INGEST, {
                              url: doc,
                              provider: "gemini",
                            });
                            await loadSessionStats();
                            onRefresh?.();
                            toast({
                              title: "Re-scraped",
                              description: `${doc} has been re-ingested`,
                              className:
                                "border-green-500/50 bg-green-50 dark:bg-green-950/30",
                            });
                          } catch {
                            toast({
                              title: "Re-scrape Failed",
                              variant: "destructive",
                            });
                          } finally {
                            setDeletingDoc(null);
                          }
                        }}
                        className="h-6 w-6 p-0 hover:bg-sky-500/20 hover:text-sky-400"
                        title="Re-scrape document"
                      >
                        <RotateCw className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deletingDoc === doc}
                            className="h-6 w-6 p-0 hover:bg-red-500/20 hover:text-red-400"
                            title="Delete document"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-900 border-slate-700">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-sky-400">
                              Delete Document?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-300">
                              Remove "{doc}" from your knowledge base?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  setDeletingDoc(doc);
                                  // Delete document from backend
                                  const deleteUrl = `${API_ENDPOINTS.DATABASE_SOURCE_DELETE}?url=${encodeURIComponent(doc)}`;
                                  await apiDelete(deleteUrl);

                                  await loadSessionStats();
                                  onRefresh?.();
                                  toast({
                                    title: "Document Deleted",
                                    description: `${doc} has been removed`,
                                    className:
                                      "border-green-500/50 bg-green-50 dark:bg-green-950/30",
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Delete Failed",
                                    description:
                                      "Failed to delete document. Please try again.",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setDeletingDoc(null);
                                }
                              }}
                              className="bg-red-600 text-white hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadSessionStats();
              onRefresh?.();
            }}
            disabled={loading}
            className="flex-1 bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700 hover:text-sky-300 hover:border-sky-500/50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 bg-slate-800 border-slate-700 text-red-400 hover:bg-red-950/30 hover:text-red-300 hover:border-red-500/50 disabled:opacity-50"
                disabled={loading}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-slate-900 border-slate-700">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sky-400">
                  Clear Session?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-300">
                  This will permanently delete all documents and data in your
                  current session. This action cannot be undone. A new session
                  will be created automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearSession}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Clear Session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Session Expiry Info */}
        <div className="flex items-center gap-2 text-xs text-slate-400 pt-2 border-t border-slate-700">
          <Clock className="h-3 w-3" />
          <span>Session expires after 24h of inactivity</span>
        </div>
      </CardContent>
    </Card>
  );
}
