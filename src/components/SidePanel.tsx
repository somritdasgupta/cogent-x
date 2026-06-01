import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDeleteChatDialog } from "@/components/ConfirmDeleteChatDialog";
import { Badge } from "@/components/ui/badge";
import { API_ENDPOINTS, buildApiUrl } from "@/config/api";
import { getSessionId } from "@/lib/session";

interface ConversationHistory {
  id: string;
  preview: string;
}

interface SidePanelProps {
  histories: ConversationHistory[];
  onSelectConversation: (c: ConversationHistory) => void;
  onDeleteConversation: (id: string, moveDocsToGlobal?: boolean) => void;
  startNewChat: () => void;
}

export const SidePanel = ({
  histories,
  onSelectConversation,
  onDeleteConversation,
  startNewChat,
}: SidePanelProps) => {
  const [chatStats, setChatStats] = useState<Record<string, number>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<{
    id: string;
    title: string;
    preview: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchChatStats = useCallback(async () => {
    try {
      const sessionId = getSessionId();
      const response = await fetch(buildApiUrl(API_ENDPOINTS.CHAT_STATS), {
        headers: { "X-Session-Id": sessionId || "" },
      });
      if (response.ok) {
        const data = await response.json();
        setChatStats(data.chat_stats || {});
      }
    } catch (error) {
      console.error("Failed to fetch chat statistics:", error);
    }
  }, []);

  useEffect(() => {
    void fetchChatStats();
    const interval = setInterval(fetchChatStats, 10000);
    return () => clearInterval(interval);
  }, [fetchChatStats]);

  const handleDeleteClick = (h: ConversationHistory) => {
    setPendingDeleteChat({ id: h.id, title: h.preview, preview: h.preview });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async (moveToGlobal: boolean) => {
    if (!pendingDeleteChat) return;

    setIsDeleting(true);
    try {
      onDeleteConversation(pendingDeleteChat.id, moveToGlobal);
      setDeleteConfirmOpen(false);
      setPendingDeleteChat(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <aside className="hidden h-full lg:block bg-transparent">
      <div className="flex h-full w-[17rem] flex-col overflow-hidden rounded-[1rem] border-2 border-border/30 bg-background/55 p-4">
        <div className="flex h-full flex-col gap-4 bg-transparent pt-1">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {histories.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 px-3 text-center h-full">
                  <div className="relative w-16 h-16 mb-2">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent blur-xl animate-pulse" />
                    <div className="relative flex items-center justify-center w-full h-full">
                      <svg
                        className="w-8 h-8 text-primary/60"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M21 21H3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v16z" />
                        <path d="M9 9h6M9 13h6M9 17h3" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Start exploring
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Your conversations will appear here. Begin by asking a
                      question or uploading documents.
                    </p>
                  </div>
                </div>
              ) : (
                histories.slice(0, 12).map((h) => {
                  const docCount = chatStats[h.id] || 0;
                  return (
                    <div
                      key={h.id}
                      className="group w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition-all bg-background/30 border border-primary/40 hover:bg-background/60 active:scale-95 hover:shadow-lg"
                      title={h.preview}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectConversation(h)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-xs font-medium text-foreground/80 group-hover:text-foreground">
                          {h.preview}
                        </p>
                      </button>
                      {docCount > 0 && (
                        <Badge className="shrink-0 bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5">
                          {docCount}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(h)}
                        aria-label={`Delete conversation: ${h.preview}`}
                        className="shrink-0 rounded p-1 text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <Button
              onClick={startNewChat}
              className="h-10 w-full justify-start rounded-xl border border-primary/40 bg-background/30 px-3 text-sm font-semibold text-foreground hover:border-primary/60 hover:bg-background/60"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New conversation
            </Button>
          </div>
        </div>

        <ConfirmDeleteChatDialog
          open={deleteConfirmOpen}
          chatTitle={pendingDeleteChat?.title || ""}
          documentCount={chatStats[pendingDeleteChat?.id || ""] || 0}
          onConfirmDelete={handleConfirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setPendingDeleteChat(null);
          }}
          isLoading={isDeleting}
        />
      </div>
    </aside>
  );
};

export default SidePanel;
