import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useTheme } from "next-themes";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Check,
  CheckCircle,
  ChevronRight,
  Copy,
  Bot,
  Database,
  FileText,
  Loader2,
  Linkedin,
  Moon,
  Plus,
  Send,
  Settings,
  Sparkles,
  Activity,
  SunMedium,
  SlidersHorizontal,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { SiGooglegemini, SiGithub, SiOpenai, SiOllama } from "react-icons/si";
import Logo from "@/components/Logo";
import SidePanel from "@/components/SidePanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SourceModal } from "@/components/SourceModal";
import { ModernSettingsPanel } from "@/components/ModernSettingsPanel";
import { API_ENDPOINTS, apiGet, apiPost, getApiDocsUrl } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

const promptBank = [
  "What should I upload first through a URL?",
  "How do I connect a new source to this workspace?",
  "Which document should I start with?",
  "Can you summarize the files I already added?",
  "How do I switch models for this conversation?",
  "What settings should I change for long documents?",
  "How does ingestion work from a URL?",
  "What can I ask after uploading my docs?",
  "How do I troubleshoot a failed upload?",
  "Which provider is best for private data?",
  "Can you explain the current knowledge base setup?",
  "What is a good first question for my docs?",
];

const providerOptions = [
  {
    value: "opensource",
    label: "Ollama",
    icon: SiOllama,
  },
  {
    value: "openai",
    label: "OpenAI",
    icon: SiOpenai,
  },
  {
    value: "gemini",
    label: "Gemini",
    icon: SiGooglegemini,
  },
] as const;

const pickPrompts = (items: string[], count: number) => {
  const pool = [...items];
  const selected: string[] = [];

  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    const [nextPrompt] = pool.splice(index, 1);
    if (nextPrompt) selected.push(nextPrompt);
  }

  return selected;
};

const readHistory = (): ChatConversation[] => {
  try {
    return JSON.parse(localStorage.getItem("chat_history") || "[]");
  } catch {
    return [];
  }
};

export const ModernWorkspace = () => {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    return (
      localStorage.getItem("current_conversation_id") || crypto.randomUUID()
    );
  });
  const [conversationTitle, setConversationTitle] =
    useState("New Conversation");
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("chat_messages") || "[]");
    } catch {
      return [];
    }
  });
  const [currentQuery, setCurrentQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasDocuments, setHasDocuments] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState({
    backend: false,
    llm: false,
    vectorDB: false,
  });
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource",
  );
  const [viewingSource, setViewingSource] = useState<{
    url: string;
    usedChunks: number[];
  } | null>(null);
  const [, setChatHistoryUpdate] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiProviderRef = useRef(aiProvider);

  const prompts = useMemo(() => pickPrompts(promptBank, 3), []);
  const activeProvider = useMemo(() => {
    return (
      providerOptions.find((provider) => provider.value === aiProvider) ||
      providerOptions[0]
    );
  }, [aiProvider]);

  const refreshWorkspaceStatus = useCallback(async () => {
    try {
      const [configRes, healthRes, kbRes, statsRes] = await Promise.all([
        apiGet(API_ENDPOINTS.CONFIG),
        apiGet(API_ENDPOINTS.HEALTH),
        apiGet(API_ENDPOINTS.KNOWLEDGE_BASES),
        apiGet(API_ENDPOINTS.DATABASE_STATS),
      ]);

      if (configRes.ok) {
        const config = await configRes.json();
        setIsConfigured(!!(config.openai_api_key || config.gemini_api_key));
      }

      if (healthRes.ok) {
        setSystemStatus(await healthRes.json());
      }

      if (kbRes.ok) {
        const data = await kbRes.json();
        setAvailableDocuments(data.knowledge_bases || []);
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setHasDocuments((stats.total_documents || 0) > 0);
      }
    } catch {
      setSystemStatus({ backend: false, llm: false, vectorDB: false });
    }
  }, []);

  const handleProviderChange = useCallback((nextProvider: string) => {
    setAiProvider(nextProvider);
    localStorage.setItem("aiProvider", nextProvider);
    try {
      window.dispatchEvent(
        new CustomEvent("aiProviderChanged", { detail: nextProvider }),
      );
    } catch {
      window.dispatchEvent(new Event("storage"));
    }
  }, []);

  useEffect(() => {
    aiProviderRef.current = aiProvider;
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<string>;
      if (ce && ce.detail) {
        setAiProvider(ce.detail);
      }
    };

    const storageHandler = (ev: StorageEvent) => {
      if (ev.key === "aiProvider") {
        setAiProvider(ev.newValue || "opensource");
      }
    };

    window.addEventListener("aiProviderChanged", handler as EventListener);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("aiProviderChanged", handler as EventListener);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("chat_messages", JSON.stringify(messages));
    if (!currentConversationId || messages.length === 0) return;

    const history = readHistory();
    const index = history.findIndex(
      (item) => item.conversationId === currentConversationId,
    );
    const firstUserMessage = messages.find(
      (message) => message.role === "user",
    );
    const preview = firstUserMessage
      ? `${firstUserMessage.content.substring(0, 50)}${firstUserMessage.content.length > 50 ? "..." : ""}`
      : "New conversation";

    const nextConversation: ChatConversation = {
      id: index >= 0 ? history[index].id : Date.now().toString(),
      timestamp: new Date().toISOString(),
      messages: [...messages],
      preview,
      conversationId: currentConversationId,
    };

    if (index >= 0) {
      history[index] = nextConversation;
    } else {
      history.unshift(nextConversation);
    }

    localStorage.setItem("chat_history", JSON.stringify(history.slice(0, 50)));
  }, [messages, currentConversationId]);

  useEffect(() => {
    refreshWorkspaceStatus();
    const interval = setInterval(refreshWorkspaceStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshWorkspaceStatus]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  const startNewChat = useCallback(() => {
    const newConversationId = crypto.randomUUID();
    setCurrentConversationId(newConversationId);
    setConversationTitle("New Conversation");
    setCurrentQuery("");
    setMessages([]);
    localStorage.setItem("current_conversation_id", newConversationId);
    localStorage.setItem("chat_messages", "[]");
    toast({
      title: "New chat ready",
      description: "A fresh conversation has started.",
    });
  }, [toast]);

  const selectConversation = useCallback((conversation: ChatConversation) => {
    setMessages(conversation.messages);
    setCurrentConversationId(conversation.conversationId || conversation.id);
    setConversationTitle(conversation.preview || "Conversation");
    localStorage.setItem(
      "chat_messages",
      JSON.stringify(conversation.messages),
    );
    localStorage.setItem(
      "current_conversation_id",
      conversation.conversationId || conversation.id,
    );
  }, []);

  const deleteConversation = useCallback(
    (id: string, moveDocsToGlobal?: boolean) => {
      const history = readHistory().filter((item) => item.id !== id);
      localStorage.setItem("chat_history", JSON.stringify(history));

      if (
        history.every((item) => item.conversationId !== currentConversationId)
      ) {
        setMessages([]);
        setConversationTitle("New Conversation");
        setCurrentConversationId(crypto.randomUUID());
        localStorage.removeItem("chat_messages");
      }
      setChatHistoryUpdate((prev) => prev + 1);
    },
    [currentConversationId],
  );

  const copyToClipboard = async (content: string, messageId: string) => {
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
    setTimeout(() => setCopiedMessageId(null), 1600);
  };

  const handleQuerySubmission = useCallback(
    async (e: FormEvent | MouseEvent, promptText?: string) => {
      e.preventDefault();
      const queryText = (promptText || currentQuery).trim();
      if (!queryText || isProcessing) return;

      if (!isConfigured) {
        toast({
          title: "Setup required",
          description: "Open settings and configure a provider first.",
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
        const title = `${queryText.substring(0, 50)}${queryText.length > 50 ? "..." : ""}`;
        setConversationTitle(title);
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
          throw new Error(errorText || "Query failed");
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
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content:
              error instanceof Error
                ? `Unable to process query. ${error.message}`
                : "Unable to process query.",
            timestamp: new Date(),
          },
        ]);
        toast({ title: "Query failed", variant: "destructive" });
      } finally {
        setIsProcessing(false);
        setChatHistoryUpdate((prev) => prev + 1);
      }
    },
    [
      aiProviderRef,
      currentConversationId,
      currentQuery,
      isConfigured,
      isProcessing,
      messages.length,
      selectedDocuments,
      toast,
    ],
  );

  const histories = readHistory();
  const darkMode = theme === "dark";

  const renderMessage = (message: Message) => {
    const isUser = message.role === "user";
    return (
      <div
        key={message.id}
        className={`group flex gap-3 sm:gap-4 animate-enter-scale w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`flex flex-col gap-2 max-w-[88%] sm:max-w-[82%] md:max-w-[72%] lg:max-w-[62%] min-w-0 ${isUser ? "items-end" : "items-start"}`}
        >
          <div className="relative">
            {!isUser && (
              <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                <div className="absolute -left-5 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/25 via-primary/12 to-transparent blur-3xl animate-drift" />
                <div className="absolute -right-5 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/18 via-fuchsia-500/9 to-transparent blur-3xl animate-blob animation-delay-2000" />
              </div>
            )}
            <div
              className={cn(
                "relative rounded-xl px-4 py-3 sm:px-5 sm:py-4 backdrop-blur-sm transition-all duration-200 ease-out",
                isUser
                  ? "bg-gradient-to-br from-primary/15 to-primary/8 text-foreground shadow-sm border border-primary/30 hover:border-primary/50 hover:bg-primary/12"
                  : "bg-background/50 border border-border/20 shadow-xs hover:border-border/30 dark:bg-background/40",
              )}
            >
              <div
                className={cn(
                  "prose prose-sm break-words min-w-0 prose-p:my-2 prose-p:leading-relaxed prose-headings:font-semibold prose-p:break-words prose-li:break-words prose-blockquote:break-words",
                  isUser ? "prose-invert" : "dark:prose-invert",
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props) {
                      const { children, className, ...rest } = props;
                      const match = /language-(\w+)/.exec(className || "");
                      const codeContent = String(children).replace(/\n$/, "");
                      const isInline = !match && !className;

                      if (!isInline && match) {
                        return (
                          <div className="my-4 w-full max-w-full overflow-hidden rounded-xl border border-border/30 bg-background/95 backdrop-blur-xl shadow-lg">
                            <div className="flex items-center justify-between border-b border-border/60 bg-background/60 px-4 py-2.5 backdrop-blur-xl">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {match[1]}
                              </span>
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(codeContent)
                                }
                                className="rounded-xl border border-primary/40 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-background hover:shadow-md hover:border-primary/60"
                              >
                                Copy
                              </button>
                            </div>
                            <div className="overflow-x-auto w-full">
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="!m-0 !rounded-none !bg-background/40 !w-full !min-w-max"
                                wrapLines
                                wrapLongLines
                              >
                                {codeContent}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <code
                          className={cn(
                            "rounded-xl px-1.5 py-0.5 break-all inline-block",
                            isUser ? "bg-white/20" : "bg-primary/10",
                          )}
                          {...rest}
                        >
                          {children}
                        </code>
                      );
                    },
                    p({ children }) {
                      return (
                        <p className="break-words w-full overflow-hidden">
                          {children}
                        </p>
                      );
                    },
                    a({ children, href }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "break-all underline-offset-4 hover:underline font-medium",
                            isUser ? "text-white" : "text-primary",
                          )}
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
          </div>
          <div
            className={`flex items-center gap-2 px-2 min-w-0 flex-wrap ${isUser ? "justify-end" : "justify-start"}`}
          >
            <span className="text-[10px] font-medium text-muted-foreground shrink-0">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {message.sources?.length ? (
              <div className="flex gap-1.5 flex-wrap min-w-0">
                {message.sources.map((source, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      setViewingSource({
                        url: source.url,
                        usedChunks: source.used_chunks.map(
                          (chunk) => chunk.index,
                        ),
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-background/70 backdrop-blur-xl px-2.5 py-1 text-[10px] font-semibold text-foreground transition-all hover:border-primary/60 hover:bg-background hover:shadow-lg hover:shadow-primary/10 shrink-0"
                  >
                    <FileText className="h-3 w-3" />
                    Source {idx + 1}
                  </button>
                ))}
              </div>
            ) : null}
            {!isUser && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(message.content, message.id)}
                className="h-7 rounded-xl border border-primary/40 bg-background/70 backdrop-blur-xl px-3 text-[10px] font-semibold hover:bg-background hover:shadow-lg transition-all hover:border-primary/60"
              >
                {copiedMessageId === message.id ? (
                  <>
                    <Check className="mr-1.5 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-transparent text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-[-10rem] h-96 w-96 rounded-full bg-gradient-to-br from-primary/25 via-primary/15 to-transparent blur-3xl animate-drift" />
        <div className="absolute top-16 right-[-9rem] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-fuchsia-500/20 via-fuchsia-500/10 to-transparent blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-cyan-400/15 via-cyan-400/8 to-transparent blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute top-1/2 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-primary/12 via-primary/6 to-transparent blur-3xl animate-drift animation-delay-2000" />
      </div>

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-col gap-4 p-3 sm:p-4 lg:p-5">
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border-2 border-border/30 bg-background/60 px-4 py-3 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={28} />
            <div className="min-w-0 leading-none">
              <div className="truncate text-base font-black tracking-tight sm:text-lg">
                Cogent-x
              </div>
              <div className="truncate text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Workspace
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            <ModernSettingsPanel noSidebar initialSection="providers">
              <Button
                variant="outline"
                className="h-10 rounded-xl border-primary/40 bg-background/40 px-3 hover:border-primary/60 hover:bg-background/70 sm:px-3"
                title={`Active model: ${activeProvider.label}`}
                aria-label={`Open provider settings for ${activeProvider.label}`}
              >
                <activeProvider.icon className="mr-0 h-4 w-4 sm:mr-2" />
                <span className="hidden truncate text-sm font-semibold sm:inline">
                  {activeProvider.label}
                </span>
              </Button>
            </ModernSettingsPanel>
            <ModernSettingsPanel noSidebar initialSection="tune">
              <Button
                variant="outline"
                className="h-10 w-10 rounded-xl border-primary/40 bg-background/40 p-0 hover:border-primary/60 hover:bg-background/70"
                title="Tuning"
                aria-label="Tuning"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </ModernSettingsPanel>
            <ModernSettingsPanel noSidebar initialSection="ingest">
              <Button
                variant="outline"
                className="h-10 rounded-xl border-primary/40 bg-background/40 px-3 hover:border-primary/60 hover:bg-background/70 sm:px-4"
              >
                <Upload className="mr-0 h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Ingest</span>
              </Button>
            </ModernSettingsPanel>
            <ModernSettingsPanel noSidebar initialSection="overview">
              <Button
                variant="outline"
                className="h-10 w-10 rounded-xl border-primary/40 bg-background/40 p-0 hover:border-primary/60 hover:bg-background/70"
                title="Open control center"
                aria-label="Open control center"
              >
                <Activity className="h-4 w-4" />
              </Button>
            </ModernSettingsPanel>
            <Button
              variant="outline"
              onClick={() => setTheme(darkMode ? "light" : "dark")}
              className="h-10 w-10 rounded-xl border-primary/40 bg-background/40 p-0 hover:border-primary/60 hover:bg-background/70"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {darkMode ? (
                <SunMedium className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[17rem_minmax(0,1fr)]">
          <SidePanel
            histories={histories}
            onSelectConversation={selectConversation}
            onDeleteConversation={deleteConversation}
            startNewChat={startNewChat}
          />

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1rem] border-2 border-border/30">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
              <div className="flex min-h-0 flex-1 flex-col gap-6">
                <section className="min-h-0 flex-1 overflow-hidden">
                  {messages.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto">
                      <div className="w-full max-w-5xl space-y-6 pt-4 px-2 sm:px-4 lg:px-6">
                        {!isConfigured && (
                          <div className="rounded-3xl border border-primary/20 bg-background/45 px-4 py-3 text-sm text-muted-foreground backdrop-blur-2xl">
                            Set up a provider in the header to enable chat.
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
                          {prompts.slice(0, 3).map((prompt) => (
                            <button
                              key={prompt}
                              onClick={(event) =>
                                handleQuerySubmission(event, prompt)
                              }
                              className="group rounded-[1rem] border-2 border-border/70 bg-background/60 p-5 text-left backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-primary/30 hover:bg-background/90"
                            >
                              <div className="flex items-start gap-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                                  <Sparkles className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium leading-relaxed text-foreground/90">
                                    {prompt}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-b from-background/70 via-background/45 to-background/70 p-4 shadow-[0_20px_70px_-15px_rgba(0,0,0,0.3)] backdrop-blur-2xl w-full">
                      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
                        <div className="space-y-6 pb-4 pr-1 w-full">
                          {messages.map(renderMessage)}

                          {isProcessing && (
                            <div className="flex items-start gap-4 animate-in fade-in-50 duration-300">
                              <div className="flex max-w-[65%] flex-col gap-2">
                                <div className="relative">
                                  <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                                    <div className="absolute -left-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent blur-2xl animate-drift" />
                                    <div className="absolute -right-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/15 via-fuchsia-500/8 to-transparent blur-2xl animate-blob animation-delay-2000" />
                                  </div>
                                  <div className="relative rounded-2xl border border-border/30 bg-gradient-to-b from-background/60 via-background/40 to-background/60 px-4 py-3 backdrop-blur-2xl shadow-md">
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-medium italic text-muted-foreground">
                                        Thinking
                                      </span>
                                      <div className="flex gap-1.5">
                                        <span
                                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gradient-to-br from-primary to-fuchsia-500 shadow-md shadow-primary/40"
                                          style={{ animationDelay: "0ms" }}
                                        />
                                        <span
                                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gradient-to-br from-primary to-fuchsia-500 shadow-md shadow-primary/40"
                                          style={{ animationDelay: "150ms" }}
                                        />
                                        <span
                                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gradient-to-br from-primary to-fuchsia-500 shadow-md shadow-primary/40"
                                          style={{ animationDelay: "300ms" }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div ref={scrollRef} />
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="shrink-0 p-3 sm:p-4">
              <form onSubmit={handleQuerySubmission} className="relative">
                <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                  <div className="absolute -left-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/15 via-primary/8 to-transparent blur-3xl animate-drift" />
                  <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/12 via-fuchsia-500/6 to-transparent blur-3xl animate-blob animation-delay-2000" />
                  <div className="absolute left-1/2 -top-6 h-20 w-20 -translate-x-1/2 rounded-full bg-gradient-to-br from-cyan-400/10 via-cyan-400/5 to-transparent blur-3xl animate-blob animation-delay-4000" />
                </div>
                <div className="relative rounded-[1rem] border border-border/40 bg-gradient-to-b from-background/60 via-background/40 to-background/60 p-2.5 shadow-lg shadow-primary/8 backdrop-blur-3xl transition-all duration-300 focus-within:shadow-xl focus-within:shadow-primary/30 focus-within:border-primary/60 animate-neon-glow">
                  <div className="flex items-center gap-2">
                    <Input
                      value={currentQuery}
                      onChange={(event) => setCurrentQuery(event.target.value)}
                      placeholder="Ask anything about your knowledge base..."
                      disabled={isProcessing}
                      className="h-11 sm:h-12 min-w-0 flex-1 border-0 bg-transparent pl-4 pr-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                    />
                    <div className="flex items-center gap-1.5 pr-1">
                      <Button
                        type="submit"
                        disabled={isProcessing || !currentQuery.trim()}
                        size="icon"
                        className="h-10 sm:h-11 w-10 sm:w-11 rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-md shadow-primary/40 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/50 disabled:scale-95 disabled:opacity-50 disabled:hover:scale-95 disabled:shadow-md active:scale-95"
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
            <footer className="shrink-0 px-2 pb-2 sm:px-3 sm:pb-3">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/30 bg-background/35 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-2xl">
                <a
                  href="https://github.com/somritdasgupta"
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-medium hover:text-foreground"
                  aria-label="Open somritdasgupta GitHub profile"
                >
                  Developed by @somritdasgupta
                </a>
                <a
                  href="https://github.com/somritdasgupta/cogent-x"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-background/50 px-2.5 py-1 font-semibold text-foreground hover:border-primary/60 hover:bg-background/80"
                  aria-label="Open source repository on GitHub"
                >
                  <SiGithub className="h-3.5 w-3.5" />
                  /cogent-x
                </a>
                <a
                  href="https://linkedin.com/in/somritdasgupta"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/30 bg-background/45 px-2.5 py-1 font-semibold text-foreground hover:border-primary/50 hover:bg-background/75"
                  aria-label="Open LinkedIn profile"
                >
                  <Linkedin className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              </div>
            </footer>
          </main>
        </div>
      </div>

      <SourceModal
        url={viewingSource?.url || null}
        usedChunks={viewingSource?.usedChunks || []}
        onClose={() => setViewingSource(null)}
      />
    </div>
  );
};

export default ModernWorkspace;
