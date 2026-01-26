import {
  useState,
  useEffect,
  useRef,
  FormEvent,
  useCallback,
  useMemo,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { SourceModal } from "@/components/SourceModal";
import { UnifiedSettingsPanel } from "@/components/UnifiedSettingsPanel";
import {
  Loader2,
  Send,
  Copy,
  Check,
  Sparkles,
  Plus,
  Activity,
  BookOpen,
  Menu,
  Heart,
  Github,
  Settings,
  CheckCircle,
  AlertCircle,
  Upload,
  Database,
  Zap,
  Shield,
  FileText,
  MessageSquare,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { API_ENDPOINTS, apiPost, apiGet, getApiDocsUrl } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import {
  createConversationSession,
  getConversationSession,
} from "@/lib/session";

interface SourceInfo {
  url: string;
  used_chunks: { index: number; content: string }[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SourceInfo[];
}

interface ChatConversation {
  id: string;
  timestamp: string;
  messages: Message[];
  preview: string;
  conversationId: string;
}

const QueryInterface = () => {
  const { toast } = useToast();
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    const saved = localStorage.getItem("current_conversation_id");
    return saved || crypto.randomUUID();
  });
  const [conversationTitle, setConversationTitle] =
    useState("New Conversation");
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("chat_messages");
    return saved ? JSON.parse(saved) : [];
  });
  const [chatHistoryUpdate, setChatHistoryUpdate] = useState(0);
  const [currentQuery, setCurrentQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    return saved === "true";
  });
  const aiProviderRef = useRef(
    localStorage.getItem("aiProvider") || "opensource",
  );
  const statusCheckRef = useRef<NodeJS.Timeout | null>(null);
  const configCheckRef = useRef<NodeJS.Timeout | null>(null);
  const [viewingSource, setViewingSource] = useState<{
    url: string;
    usedChunks: number[];
  } | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasDocuments, setHasDocuments] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState({
    backend: false,
    llm: false,
    vectorDB: false,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [randomPrompts] = useState(() => {
    const allPrompts = [
      "Setup & environment requirements",
      "Installation & deployment steps",
      "Configuration reference",
      "System architecture overview",
      "API endpoints documentation",
      "Authentication guide",
      "Common errors & solutions",
      "Database schema",
      "Getting started guide",
      "Best practices",
      "Troubleshooting tips",
      "Performance optimization",
    ];
    return [...allPrompts].sort(() => Math.random() - 0.5).slice(0, 3);
  });

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("chat_messages", JSON.stringify(messages));

    // Also update the conversation in chat history if it exists
    if (messages.length > 0 && currentConversationId) {
      const conversations = JSON.parse(
        localStorage.getItem("chat_history") || "[]",
      );

      const existingIndex = conversations.findIndex(
        (c: ChatConversation) => c.conversationId === currentConversationId,
      );

      if (existingIndex >= 0) {
        const firstUserMessage = messages.find((m) => m.role === "user");
        const preview = firstUserMessage
          ? firstUserMessage.content.substring(0, 50) +
            (firstUserMessage.content.length > 50 ? "..." : "")
          : "New conversation";

        conversations[existingIndex] = {
          ...conversations[existingIndex],
          messages: [...messages],
          preview: preview,
          timestamp: new Date().toISOString(),
        };

        localStorage.setItem(
          "chat_history",
          JSON.stringify(conversations.slice(0, 50)),
        );
      }
    }
  }, [messages, currentConversationId]);

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      const plainText = content
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/^>\s+/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      await navigator.clipboard.writeText(plainText);
      setCopiedMessageId(messageId);
      toast({ title: "Copied" });
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      await checkConfiguration();
      await checkStatus();
    };
    init();

    // Use refs to store interval IDs for better cleanup
    configCheckRef.current = setInterval(checkConfiguration, 30000);
    statusCheckRef.current = setInterval(checkStatus, 30000);

    return () => {
      if (configCheckRef.current) clearInterval(configCheckRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkConfiguration = useCallback(async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.CONFIG);
      if (response.ok) {
        const config = await response.json();
        const hasApiKey = config.openai_api_key || config.gemini_api_key;
        const newConfigured = !!hasApiKey;
        // Only update if value actually changed
        if (newConfigured !== isConfigured) {
          setIsConfigured(newConfigured);
        }
      }
    } catch {
      if (isConfigured) setIsConfigured(false);
    }
  }, [isConfigured]);

  const checkStatus = useCallback(async () => {
    try {
      const [healthResponse, statsResponse] = await Promise.all([
        apiGet(API_ENDPOINTS.HEALTH),
        apiGet(API_ENDPOINTS.DATABASE_STATS),
      ]);

      if (healthResponse.ok) {
        const data = await healthResponse.json();
        // Only update if values actually changed
        if (JSON.stringify(data) !== JSON.stringify(systemStatus)) {
          setSystemStatus(data);
        }
      }

      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        const docsExist = stats.total_documents > 0;
        if (docsExist !== hasDocuments) {
          setHasDocuments(docsExist);
        }
      }

      // Fetch available documents
      const kbResponse = await apiGet(API_ENDPOINTS.KNOWLEDGE_BASES);
      if (kbResponse.ok) {
        const kbData = await kbResponse.json();
        const docs = kbData.knowledge_bases || [];
        if (JSON.stringify(docs) !== JSON.stringify(availableDocuments)) {
          setAvailableDocuments(docs);
        }
      }
    } catch {
      const offline = { backend: false, llm: false, vectorDB: false };
      if (JSON.stringify(offline) !== JSON.stringify(systemStatus)) {
        setSystemStatus(offline);
      }
      if (hasDocuments) setHasDocuments(false);
    }
  }, [systemStatus, hasDocuments, availableDocuments]);

  const handleQuerySubmission = useCallback(
    async (e: FormEvent | React.MouseEvent, promptText?: string) => {
      e.preventDefault();
      const queryText = promptText || currentQuery;
      if (!queryText.trim() || isProcessing) return;

      // Check if configured before allowing query
      if (!isConfigured) {
        toast({
          title: "Setup Required",
          description: "Please configure your AI provider in Settings first.",
          variant: "destructive",
        });
        return;
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: queryText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setCurrentQuery("");
      setIsProcessing(true);

      if (messages.length === 0) {
        const title =
          queryText.substring(0, 50) + (queryText.length > 50 ? "..." : "");
        setConversationTitle(title);

        // Update or create chat history entry for this conversation
        const conversations = JSON.parse(
          localStorage.getItem("chat_history") || "[]",
        );

        const existingIndex = conversations.findIndex(
          (c: ChatConversation) => c.conversationId === currentConversationId,
        );

        if (existingIndex >= 0) {
          // Update existing placeholder with actual title
          conversations[existingIndex].preview = title;
          conversations[existingIndex].messages = [userMessage];
          conversations[existingIndex].timestamp = new Date().toISOString();
        } else {
          // Create new entry if somehow doesn't exist
          conversations.unshift({
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            messages: [userMessage],
            preview: title,
            conversationId: currentConversationId,
          });
        }

        localStorage.setItem(
          "chat_history",
          JSON.stringify(conversations.slice(0, 50)),
        );
        setChatHistoryUpdate((prev) => prev + 1);
      }

      try {
        const response = await apiPost(API_ENDPOINTS.ASK, {
          query: queryText,
          provider: aiProviderRef.current,
          conversation_id: currentConversationId,
          selected_documents:
            selectedDocuments.length > 0 ? selectedDocuments : null,
        });
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = "Query failed";
          try {
            const errorData = JSON.parse(errorText);
            errorMessage =
              errorData.detail || errorData.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.answer,
          timestamp: new Date(),
          sources: data.sources || [],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        let errorContent = "Unable to process query. ";
        if (error instanceof TypeError && error.message.includes("fetch")) {
          errorContent += "Cannot connect to backend.";
        } else if (error instanceof Error) {
          errorContent += error.message;
        }
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: errorContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        toast({ title: "Query Failed", variant: "destructive" });
      } finally {
        setIsProcessing(false);
        setChatHistoryUpdate((prev) => prev + 1);
      }
    },
    [
      currentQuery,
      messages,
      isConfigured,
      currentConversationId,
      toast,
      isProcessing,
      selectedDocuments,
    ],
  );

  const Sidebar = () => {
    const isSystemReady =
      systemStatus.backend && systemStatus.llm && systemStatus.vectorDB;

    const toggleSidebar = () => {
      const newState = !isSidebarCollapsed;
      setIsSidebarCollapsed(newState);
      localStorage.setItem("sidebar_collapsed", String(newState));
    };

    return (
      <div
        className={`h-full flex flex-col bg-slate-950/95 backdrop-blur-xl border-r border-slate-700/50 transition-all duration-300 ${isSidebarCollapsed ? "w-16" : "w-full"}`}
      >
        {/* Quick Actions */}
        <div
          className={`${isSidebarCollapsed ? "p-1.5 space-y-1.5" : "p-3 space-y-2"} pt-3`}
        >
          <Button
            variant="ghost"
            className={`w-full ${isSidebarCollapsed ? "h-10 p-0" : "h-11 gap-2.5 justify-start"} rounded-lg font-bold border border-sky-400/40 bg-sky-400/90 hover:bg-sky-300 text-slate-900 transition-all`}
            onClick={() =>
              window.open("https://stats.uptimerobot.com/FxzeOvqyqU", "_blank")
            }
            title="Status"
          >
            <Activity className="h-4 w-4" />
            {!isSidebarCollapsed && <span>Status</span>}
          </Button>

          <Button
            variant="ghost"
            className={`w-full ${isSidebarCollapsed ? "h-10 p-0" : "h-11 gap-2.5 justify-start"} rounded-lg font-bold border border-sky-400/40 bg-sky-400/90 hover:bg-sky-300 text-slate-900 transition-all`}
            onClick={() => window.open(getApiDocsUrl(), "_blank")}
            title="API Docs"
          >
            <BookOpen className="h-4 w-4" />
            {!isSidebarCollapsed && <span>API Docs</span>}
          </Button>

          <UnifiedSettingsPanel onConfigChange={checkConfiguration}>
            <Button
              variant="ghost"
              className={`w-full ${isSidebarCollapsed ? "h-10 p-0" : "h-11 gap-2.5 justify-start"} rounded-lg font-bold border border-sky-400/40 bg-sky-400/90 hover:bg-sky-300 text-slate-900 transition-all`}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
              {!isSidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">Settings</span>
                  {isSystemReady ? (
                    <CheckCircle className="h-4 w-4 text-green-500 fill-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500 fill-red-500" />
                  )}
                </>
              )}
            </Button>
          </UnifiedSettingsPanel>
        </div>

        {/* Divider */}
        <div className="h-px bg-sky-500/40 mx-2" />

        {/* Chat History */}
        <div className="flex-1 overflow-hidden min-h-0 py-2 w-full">
          <ScrollArea className="h-full w-full">
            <div className={`${isSidebarCollapsed ? "px-1.5" : "px-3"} w-full`}>
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between px-2 mb-2">
                  <p className="text-xs font-bold text-sky-400/90 uppercase tracking-wider">
                    Recent
                  </p>
                  {(() => {
                    const history = JSON.parse(
                      localStorage.getItem("chat_history") || "[]",
                    );
                    return history.length > 0 ? (
                      <button
                        onClick={() => {
                          localStorage.removeItem("chat_history");
                          localStorage.removeItem("chat_messages");
                          setMessages([]);
                          setChatHistoryUpdate((prev) => prev + 1);
                        }}
                        className="text-[10px] font-bold text-red-300 hover:text-red-200 transition-colors px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20"
                        title="Clear all chat history"
                      >
                        Clear
                      </button>
                    ) : null;
                  })()}
                </div>
              )}
              {(() => {
                const history = JSON.parse(
                  localStorage.getItem("chat_history") || "[]",
                );
                return history.length > 0 ? (
                  <div
                    className={`${isSidebarCollapsed ? "space-y-1" : "space-y-1.5"} w-full`}
                  >
                    {history
                      .slice(0, 10)
                      .map((conv: ChatConversation, index: number) =>
                        isSidebarCollapsed ? (
                          // Collapsed view - numbered buttons
                          <button
                            key={conv.id}
                            onClick={() => {
                              setMessages(conv.messages);
                              setCurrentConversationId(
                                conv.conversationId || conv.id,
                              );
                              localStorage.setItem(
                                "chat_messages",
                                JSON.stringify(conv.messages),
                              );
                              localStorage.setItem(
                                "current_conversation_id",
                                conv.conversationId || conv.id,
                              );
                            }}
                            className="w-full h-9 flex items-center justify-center rounded-md bg-sky-400/90 border border-sky-400/40 hover:bg-sky-300 transition-all text-sm font-bold text-slate-900"
                            title={conv.preview}
                          >
                            {index + 1}
                          </button>
                        ) : (
                          <button
                            key={conv.id}
                            onClick={() => {
                              // Save current conversation before switching
                              if (messages.length > 0) {
                                const conversations = JSON.parse(
                                  localStorage.getItem("chat_history") || "[]",
                                );
                                const currentPreview =
                                  messages
                                    .find((m) => m.role === "user")
                                    ?.content.substring(0, 50) ||
                                  "New conversation";

                                // Find and update existing conversation or create new
                                const existingIndex = conversations.findIndex(
                                  (c: ChatConversation) =>
                                    c.conversationId === currentConversationId,
                                );

                                const updatedConv = {
                                  id:
                                    existingIndex >= 0
                                      ? conversations[existingIndex].id
                                      : Date.now().toString(),
                                  timestamp: new Date().toISOString(),
                                  messages: [...messages],
                                  preview: currentPreview,
                                  conversationId: currentConversationId,
                                };

                                if (existingIndex >= 0) {
                                  conversations[existingIndex] = updatedConv;
                                } else {
                                  conversations.unshift(updatedConv);
                                }

                                localStorage.setItem(
                                  "chat_history",
                                  JSON.stringify(conversations.slice(0, 50)),
                                );
                              }

                              // Load the selected conversation
                              setMessages(conv.messages);
                              setCurrentConversationId(
                                conv.conversationId || conv.id,
                              );
                              setConversationTitle(
                                conv.preview || "Conversation",
                              );
                              localStorage.setItem(
                                "chat_messages",
                                JSON.stringify(conv.messages),
                              );
                              localStorage.setItem(
                                "current_conversation_id",
                                conv.conversationId || conv.id,
                              );
                            }}
                            className="w-full text-left py-2.5 px-3 rounded-lg border border-sky-400/40 bg-sky-400/90 hover:bg-sky-300 transition-all group"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm font-bold text-slate-900 leading-tight mb-1"
                                  title={conv.preview}
                                >
                                  {conv.preview.length > 20
                                    ? conv.preview.substring(0, 20) + "..."
                                    : conv.preview}
                                </p>
                                <p className="text-[10px] text-slate-700/70 font-medium">
                                  {new Date(
                                    conv.timestamp,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const history = JSON.parse(
                                    localStorage.getItem("chat_history") ||
                                      "[]",
                                  );
                                  // Filter out ONLY the clicked conversation by matching its unique id
                                  const updated = history.filter(
                                    (c: ChatConversation) => c.id !== conv.id,
                                  );

                                  // If we deleted the current conversation, clear the messages
                                  if (
                                    currentConversationId ===
                                    (conv.conversationId || conv.id)
                                  ) {
                                    setMessages([]);
                                    setCurrentConversationId(
                                      crypto.randomUUID(),
                                    );
                                    localStorage.removeItem("chat_messages");
                                  }

                                  localStorage.setItem(
                                    "chat_history",
                                    JSON.stringify(updated),
                                  );
                                  setChatHistoryUpdate((prev) => prev + 1);
                                  toast({ title: "Conversation deleted" });
                                }}
                                className="p-1 hover:bg-red-500/30 rounded-md transition-colors flex-shrink-0"
                                title="Delete conversation"
                              >
                                <Trash2 className="w-4 h-4 text-red-700 hover:text-red-800" />
                              </button>
                            </div>
                          </button>
                        ),
                      )}
                  </div>
                ) : !isSidebarCollapsed ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div className="w-12 h-12 rounded-xl bg-sky-400/20 border border-sky-400/40 flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6 text-sky-500/80" />
                    </div>
                    <p className="text-xs text-slate-300/80 font-medium">
                      No conversations yet
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
          </ScrollArea>
        </div>

        {/* Divider */}
        <div className="h-px bg-sky-500/40 mx-2" />

        {/* New Chat Button and Collapse Toggle */}
        <div
          className={isSidebarCollapsed ? "p-1.5 space-y-1.5" : "p-3 space-y-2"}
        >
          <Button
            onClick={() => {
              // Save current conversation ONLY if it has messages AND has at least one user message
              const hasUserMessage = messages.some((m) => m.role === "user");

              if (messages.length > 0 && hasUserMessage) {
                const conversations = JSON.parse(
                  localStorage.getItem("chat_history") || "[]",
                );

                // Find existing conversation and update it, or create new
                const existingIndex = conversations.findIndex(
                  (c: ChatConversation) =>
                    c.conversationId === currentConversationId,
                );

                const firstUserMessage = messages.find(
                  (m) => m.role === "user",
                );
                const preview = firstUserMessage
                  ? firstUserMessage.content.substring(0, 50) +
                    (firstUserMessage.content.length > 50 ? "..." : "")
                  : "New conversation";

                const updatedConv = {
                  id:
                    existingIndex >= 0
                      ? conversations[existingIndex].id
                      : Date.now().toString(),
                  timestamp: new Date().toISOString(),
                  messages: [...messages],
                  preview: preview,
                  conversationId: currentConversationId,
                };

                if (existingIndex >= 0) {
                  conversations[existingIndex] = updatedConv;
                } else {
                  conversations.unshift(updatedConv);
                }

                localStorage.setItem(
                  "chat_history",
                  JSON.stringify(conversations.slice(0, 50)),
                );
                setChatHistoryUpdate((prev) => prev + 1);
              }

              // Generate new conversation ID FIRST
              const newConvId = crypto.randomUUID();

              // Clear ALL state immediately
              setMessages([]);
              setCurrentConversationId(newConvId);
              setConversationTitle("New Conversation");
              setCurrentQuery("");

              // Clear localStorage immediately
              localStorage.setItem("current_conversation_id", newConvId);
              localStorage.setItem("chat_messages", "[]");

              // Create placeholder in chat history immediately
              const conversations = JSON.parse(
                localStorage.getItem("chat_history") || "[]",
              );

              conversations.unshift({
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                messages: [],
                preview: "💬 New Chat",
                conversationId: newConvId,
              });

              localStorage.setItem(
                "chat_history",
                JSON.stringify(conversations.slice(0, 50)),
              );

              setChatHistoryUpdate((prev) => prev + 1);

              // Show feedback
              toast({
                title: "New Chat Started",
                description: "Ready for a fresh conversation",
              });
            }}
            disabled={messages.length === 0}
            className={`w-full ${isSidebarCollapsed ? "h-10 p-0" : "h-11 gap-2"} rounded-lg font-bold bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-slate-900 shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all`}
            title={isSidebarCollapsed ? "New Chat" : undefined}
          >
            <Plus className="h-5 w-5" />
            {!isSidebarCollapsed && "New Chat"}
          </Button>

          {/* Collapse/Expand Toggle - Desktop Only */}
          <Button
            variant="ghost"
            onClick={toggleSidebar}
            className={`hidden md:flex w-full ${isSidebarCollapsed ? "h-8 p-0 justify-center" : "h-9 gap-2 justify-start px-3"} rounded-md border border-slate-700/50 bg-slate-800/40 hover:bg-slate-700/60 text-sky-300/80 hover:text-sky-200 transition-all`}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? (
              <ChevronsRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronsLeft className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 dark:bg-purple-900 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob" />
        <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 dark:bg-yellow-900 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 dark:bg-pink-900 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob animation-delay-4000" />
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <div
          className={`hidden md:flex md:flex-col border-r transition-all duration-300 ${isSidebarCollapsed ? "w-16" : "w-64"}`}
        >
          <Sidebar />
        </div>

        {/* Mobile Sidebar */}
        <Drawer>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden fixed top-3 left-3 z-50"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-[85vh] bg-slate-950 border-slate-800">
            <Sidebar />
          </DrawerContent>
        </Drawer>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {!isConfigured ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-2xl space-y-6 text-center pb-32">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h1 className="text-3xl font-bold">Welcome to cogent-x</h1>
                  <p className="text-muted-foreground">
                    AI-powered knowledge base for your documentation
                  </p>
                </div>

                <UnifiedSettingsPanel onConfigChange={checkConfiguration}>
                  <Button
                    size="lg"
                    className="bg-violet-600 hover:bg-violet-700 rounded-xl font-bold px-8"
                  >
                    <Settings className="h-5 w-5 mr-2" />
                    Get Started
                  </Button>
                </UnifiedSettingsPanel>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-2xl space-y-8 pb-32">
                <div className="flex flex-col items-center space-y-8">
                  <div className="flex items-center gap-4">
                    <h1 className="text-5xl font-black bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 bg-clip-text text-transparent leading-tight pb-2">
                      cogent-x
                    </h1>
                  </div>
                  <p className="text-xl font-bold text-center">
                    How can I assist you today?
                  </p>
                </div>

                {/* Setup Status Banner */}
                <div className="bg-muted/30 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Setup Progress
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {(systemStatus.llm ? 1 : 0) + (hasDocuments ? 1 : 0)}/2
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      {systemStatus.llm ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm">Configure AI Provider</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {hasDocuments ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm">Ingest Documentation</span>
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  <p className="text-xs font-bold text-muted-foreground mb-3 text-center">
                    QUICK START PROMPTS
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {randomPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={(e) => handleQuerySubmission(e, prompt)}
                        className="group text-left px-5 py-4 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 hover:border-violet-400 dark:hover:border-violet-600 hover:shadow-lg hover:shadow-violet-200/50 dark:hover:shadow-violet-900/30 transition-all duration-200 hover:-translate-y-0.5"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-sm font-bold text-foreground leading-relaxed pt-1">
                            {prompt}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.length > 0 && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-background/95 backdrop-blur-sm border border-border rounded-full shadow-lg max-w-xs md:max-w-md">
                  <p className="text-sm font-medium text-muted-foreground truncate text-center">
                    {conversationTitle}
                  </p>
                </div>
              )}
              <ScrollArea className="flex-1">
                <div className="w-full max-w-5xl mx-auto px-4 md:px-8 lg:px-12 pt-20 py-6 space-y-6 pb-24 md:pb-40">
                  {messages.map((message) => (
                    <div key={message.id}>
                      {message.role === "user" ? (
                        <div className="flex justify-end mb-4">
                          <div className="relative max-w-[85%] md:max-w-[70%] lg:max-w-[60%]">
                            <div className="bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
                              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-1 block text-right">
                              {new Date(message.timestamp).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3 mb-4">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 max-w-[85%] md:max-w-[70%] lg:max-w-[60%]">
                            <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm overflow-hidden">
                              <div
                                className="prose prose-sm dark:prose-invert max-w-none break-words
                                prose-p:text-[15px] prose-p:leading-relaxed prose-p:my-1.5 prose-p:break-words
                                prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:break-words
                                prose-strong:font-bold prose-strong:text-sky-300
                                prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-sky-300 prose-code:before:content-[''] prose-code:after:content-[''] prose-code:break-all
                                prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-pre:p-0 prose-pre:my-3 prose-pre:overflow-x-auto
                                prose-ul:my-2 prose-ul:text-slate-300 prose-ul:break-words prose-ol:my-2 prose-ol:text-slate-300 prose-ol:break-words prose-li:my-0.5 prose-li:break-words
                                prose-table:border-collapse prose-table:w-full prose-table:my-3 prose-table:overflow-x-auto
                                prose-th:bg-slate-800 prose-th:border prose-th:border-slate-700 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-sky-400
                                prose-td:border prose-td:border-slate-700 prose-td:px-3 prose-td:py-2 prose-td:text-slate-300 prose-td:break-words
                                prose-blockquote:border-l-sky-500 prose-blockquote:bg-slate-800/50 prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:italic prose-blockquote:break-words
                                prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline prose-a:break-all"
                              >
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    code(props) {
                                      const { children, className, ...rest } =
                                        props;
                                      const match = /language-(\w+)/.exec(
                                        className || "",
                                      );
                                      const codeContent = String(
                                        children,
                                      ).replace(/\n$/, "");
                                      const isInline = !match && !className;

                                      return !isInline && match ? (
                                        <div className="relative group my-3">
                                          <div className="flex items-center justify-between bg-slate-800 px-4 py-2 rounded-t-lg border-b border-slate-700">
                                            <span className="text-xs font-semibold text-slate-400">
                                              {match[1]}
                                            </span>
                                            <button
                                              onClick={() => {
                                                navigator.clipboard.writeText(
                                                  codeContent,
                                                );
                                                toast({
                                                  title: "Code copied!",
                                                  description:
                                                    "Code block copied to clipboard",
                                                });
                                              }}
                                              className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              <Copy className="w-3 h-3 inline mr-1" />
                                              Copy
                                            </button>
                                          </div>
                                          <SyntaxHighlighter
                                            style={vscDarkPlus}
                                            language={match[1]}
                                            PreTag="div"
                                            className="!mt-0 !rounded-t-none !rounded-b-lg !my-0"
                                            wrapLines={true}
                                            wrapLongLines={true}
                                          >
                                            {codeContent}
                                          </SyntaxHighlighter>
                                        </div>
                                      ) : (
                                        <code className={className} {...rest}>
                                          {children}
                                        </code>
                                      );
                                    },
                                    table({ children }) {
                                      return (
                                        <div className="overflow-x-auto my-3">
                                          <table className="min-w-full border-collapse">
                                            {children}
                                          </table>
                                        </div>
                                      );
                                    },
                                    p({ children }) {
                                      return (
                                        <p className="break-words overflow-wrap-anywhere">
                                          {children}
                                        </p>
                                      );
                                    },
                                    a({ children, href }) {
                                      return (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="break-all"
                                        >
                                          {children}
                                        </a>
                                      );
                                    },
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(message.timestamp).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </span>
                              {message.sources &&
                                message.sources.length > 0 && (
                                  <div className="flex gap-1.5">
                                    {message.sources.map((source, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() =>
                                          setViewingSource({
                                            url: source.url,
                                            usedChunks: source.used_chunks.map(
                                              (c) => c.index,
                                            ),
                                          })
                                        }
                                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors"
                                      >
                                        <FileText className="w-2.5 h-2.5" />
                                        {idx + 1}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(message.content, message.id)
                                }
                                className="h-6 px-2 text-[10px] hover:bg-muted"
                              >
                                {copiedMessageId === message.id ? (
                                  <Check className="h-3 w-3 mr-1" />
                                ) : (
                                  <Copy className="h-3 w-3 mr-1" />
                                )}
                                {copiedMessageId === message.id
                                  ? "Copied"
                                  : "Copy"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground font-medium">
                          Thinking
                        </p>
                        <div className="flex gap-1">
                          <span
                            className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <span
                            className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>
            </>
          )}

          {/* Floating Bottom Input - Only show if configured */}
          {isConfigured && (
            <div className="fixed md:static bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-xl border-t md:border-t-0">
              <div className="w-full max-w-5xl mx-auto px-0 md:px-8 lg:px-12">
                {/* Document Selector Chips */}
                {availableDocuments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      Context:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedDocuments([])}
                      className={`text-xs px-2.5 py-1 rounded-full transition-all ${
                        selectedDocuments.length === 0
                          ? "bg-sky-500 text-white font-semibold"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"
                      }`}
                    >
                      All Documents
                    </button>
                    {availableDocuments.map((doc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedDocuments((prev) =>
                            prev.includes(doc)
                              ? prev.filter((d) => d !== doc)
                              : [...prev, doc],
                          );
                        }}
                        className={`text-xs px-2.5 py-1 rounded-full transition-all truncate max-w-[200px] ${
                          selectedDocuments.includes(doc)
                            ? "bg-sky-500 text-white font-semibold"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"
                        }`}
                        title={doc}
                      >
                        <FileText className="w-3 h-3 inline mr-1" />
                        {doc}
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleQuerySubmission} className="relative">
                  <div className="relative">
                    <div className="absolute -inset-[2px] bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 rounded-2xl opacity-75 blur-md" />
                    <div className="absolute -inset-[2px] rounded-2xl overflow-hidden">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 animate-[spin_3s_linear_infinite] opacity-60"
                        style={{ backgroundSize: "200% 200%" }}
                      />
                    </div>
                    <div className="relative bg-background border border-border rounded-2xl shadow-lg">
                      <Input
                        value={currentQuery}
                        onChange={(e) => setCurrentQuery(e.target.value)}
                        placeholder="Ask me anything..."
                        disabled={isProcessing}
                        className="h-14 pr-14 rounded-2xl border-0 bg-transparent text-[15px] font-medium placeholder:font-normal"
                      />
                      <div className="absolute right-2 top-2">
                        <Button
                          type="submit"
                          disabled={isProcessing || !currentQuery.trim()}
                          size="icon"
                          className="h-10 w-10 bg-violet-600 hover:bg-violet-700 rounded-xl"
                        >
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        <SourceModal
          url={viewingSource?.url || null}
          usedChunks={viewingSource?.usedChunks || []}
          onClose={() => setViewingSource(null)}
        />
      </div>

      {/* Global Footer */}
      <div className="h-8 bg-slate-900 dark:bg-slate-950 border-t border-slate-800 flex items-center justify-center flex-shrink-0">
        <div className="text-[10px] text-sky-400 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span>Made with</span>
            <Heart className="w-2.5 h-2.5 fill-red-500 text-red-500" />
            <span>by</span>
            <a
              href="https://github.com/somritdasgupta"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-sky-300 transition-colors"
            >
              @somritdasgupta
            </a>
          </div>
          <span className="text-slate-600">•</span>
          <div className="flex items-center gap-1">
            <Github className="w-2.5 h-2.5" />
            <a
              href="https://github.com/somritdasgupta/cogent-x"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-sky-300 transition-colors"
            >
              Open Source
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueryInterface;
