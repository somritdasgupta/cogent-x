import { useState, useEffect, useRef, FormEvent } from "react";
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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_ENDPOINTS, apiPost, apiGet, getApiDocsUrl } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import { createConversationSession, getConversationSession } from "@/lib/session";

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
  const [conversationTitle, setConversationTitle] = useState("New Conversation");
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("chat_messages");
    return saved ? JSON.parse(saved) : [];
  });
  const [chatHistoryUpdate, setChatHistoryUpdate] = useState(0);
  const [currentQuery, setCurrentQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [aiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource"
  );
  const [viewingSource, setViewingSource] = useState<{
    url: string;
    usedChunks: number[];
  } | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
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
  }, [messages]);

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
    checkConfiguration();
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkConfiguration = () => {
    const hasProvider = localStorage.getItem("aiProvider");
    setIsConfigured(!!hasProvider);
  };

  const checkStatus = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.HEALTH);
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data);
      }
    } catch {
      setSystemStatus({ backend: false, llm: false, vectorDB: false });
    }
  };

  const handleQuerySubmission = async (
    e: FormEvent | React.MouseEvent,
    promptText?: string
  ) => {
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
      const title = queryText.substring(0, 50) + (queryText.length > 50 ? "..." : "");
      setConversationTitle(title);
    }

    try {
      const response = await apiPost(API_ENDPOINTS.ASK, {
        query: queryText,
        provider: aiProvider,
        conversation_id: currentConversationId,
      });
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Query failed";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
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
    }
  };

  const Sidebar = () => {
    const isSystemReady =
      systemStatus.backend && systemStatus.llm && systemStatus.vectorDB;

    return (
      <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        {/* Quick Actions */}
        <div className="p-4 space-y-2">
          <Button 
            variant="outline"
            className="w-full justify-start gap-3 h-12 rounded-xl font-semibold border-2"
            onClick={() => window.open("https://stats.uptimerobot.com/FxzeOvqyqU", "_blank")}
          >
            <Activity className="h-5 w-5" />
            <span>Status</span>
          </Button>
          
          <Button 
            variant="outline"
            className="w-full justify-start gap-3 h-12 rounded-xl font-semibold border-2"
            onClick={() => window.open(getApiDocsUrl(), "_blank")}
          >
            <BookOpen className="h-5 w-5" />
            <span>API Docs</span>
          </Button>
          
          <UnifiedSettingsPanel onConfigChange={checkConfiguration} inSidebar>
            <Button 
              variant="outline"
              className="w-full justify-start gap-3 h-12 rounded-xl font-semibold border-2"
            >
              <Settings className="h-5 w-5" />
              <span className="flex-1 text-left">Settings</span>
              {isSystemReady ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </Button>
          </UnifiedSettingsPanel>
        </div>
        
        <Separator />
        
        {/* Chat History */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 overflow-hidden">
              <div className="flex items-center justify-between px-2 mb-2 gap-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex-shrink-0">Recent</p>
                {(() => {
                  const history = JSON.parse(localStorage.getItem("chat_history") || "[]");
                  return history.length > 0 ? (
                    <button
                      onClick={() => {
                        localStorage.removeItem("chat_history");
                        localStorage.removeItem("chat_messages");
                        setMessages([]);
                        setChatHistoryUpdate(prev => prev + 1);
                      }}
                      className="text-[10px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors flex-shrink-0"
                      title="Clear all chat history"
                    >
                      Clear All
                    </button>
                  ) : null;
                })()}
              </div>
              {(() => {
                const history = JSON.parse(localStorage.getItem("chat_history") || "[]");
                return history.length > 0 ? (
                  <div className="space-y-1 max-w-full">
                    {history.slice(0, 10).map((conv: ChatConversation) => (
                      <div 
                        key={conv.id}
                        className="group relative flex items-center gap-1 w-full max-w-full rounded-lg border-b border-border/50 pb-1"
                      >
                        <button
                          onClick={() => {
                            // Only save current if it has messages and is different from the one being loaded
                            if (messages.length > 0 && messages[0]?.id !== conv.messages[0]?.id) {
                              const conversations = JSON.parse(localStorage.getItem("chat_history") || "[]");
                              const currentPreview = messages.find(m => m.role === "user")?.content.substring(0, 50) || "New conversation";
                              // Check if current chat already exists in history
                              const exists = conversations.some((c: ChatConversation) => c.preview === currentPreview);
                              if (!exists) {
                                conversations.unshift({
                                  id: Date.now().toString(),
                                  timestamp: new Date().toISOString(),
                                  messages: messages,
                                  preview: currentPreview
                                });
                                localStorage.setItem("chat_history", JSON.stringify(conversations.slice(0, 50)));
                              }
                            }
                            setMessages(conv.messages);
                            localStorage.setItem("chat_messages", JSON.stringify(conv.messages));
                          }}
                          className="flex-1 min-w-0 text-left py-2.5 px-3 text-sm hover:bg-muted rounded-lg transition-colors"
                        >
                          <span className="block truncate">{conv.preview}</span>
                          <span className="text-[10px] text-muted-foreground truncate block">
                            {new Date(conv.timestamp).toLocaleDateString()}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const history = JSON.parse(localStorage.getItem("chat_history") || "[]");
                            const updated = history.filter((c: ChatConversation) => c.id !== conv.id);
                            localStorage.setItem("chat_history", JSON.stringify(updated));
                            setChatHistoryUpdate(prev => prev + 1);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-950 rounded-md transition-all flex-shrink-0"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-2">
                      <MessageSquare className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">No conversations yet</p>
                  </div>
                );
              })()}
            </div>
          </ScrollArea>
        </div>
        
        <Separator />
        
        {/* New Chat Button */}
        <div className="p-4">
          <Button 
            onClick={() => {
              if (messages.length > 0) {
                const conversations = JSON.parse(localStorage.getItem("chat_history") || "[]");
                conversations.unshift({
                  id: currentConversationId,
                  timestamp: new Date().toISOString(),
                  messages: messages,
                  preview: messages.find(m => m.role === "user")?.content.substring(0, 50) || "New conversation",
                  conversationId: currentConversationId
                });
                localStorage.setItem("chat_history", JSON.stringify(conversations.slice(0, 50)));
                setChatHistoryUpdate(prev => prev + 1);
              }
              localStorage.removeItem("chat_messages");
              const newConvId = crypto.randomUUID();
              localStorage.setItem("current_conversation_id", newConvId);
              setCurrentConversationId(newConvId);
              setMessages([]);
              setConversationTitle("New Conversation");
            }}
            className="w-full justify-center gap-2 h-12 rounded-xl font-bold text-base bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg"
          >
            <Plus className="h-5 w-5" />
            New Chat
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex md:flex-col w-64 border-r">
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
          <DrawerContent className="h-[85vh]">
            <Sidebar />
          </DrawerContent>
        </Drawer>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {!isConfigured ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-3xl space-y-8 text-center pb-32">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Upload className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent mb-2">
                      Welcome to cogent-x
                    </h1>
                    <p className="text-lg text-muted-foreground">
                      Private AI knowledge base for documentation
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 rounded-xl p-5 border-2 border-blue-200 dark:border-blue-800">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center mb-3 font-bold">
                      1
                    </div>
                    <h3 className="font-bold text-lg mb-2">Configure AI</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose Ollama (free, local), OpenAI, or Gemini
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 rounded-xl p-5 border-2 border-purple-200 dark:border-purple-800">
                    <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center mb-3 font-bold">
                      2
                    </div>
                    <h3 className="font-bold text-lg mb-2">Ingest Docs</h3>
                    <p className="text-sm text-muted-foreground">
                      Add your documentation URLs to build knowledge base
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950/30 dark:to-pink-900/30 rounded-xl p-5 border-2 border-pink-200 dark:border-pink-800">
                    <div className="w-10 h-10 rounded-full bg-pink-600 text-white flex items-center justify-center mb-3 font-bold">
                      3
                    </div>
                    <h3 className="font-bold text-lg mb-2">Ask Questions</h3>
                    <p className="text-sm text-muted-foreground">
                      Get AI answers with source citations
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 justify-center">
                    <Sparkles className="h-5 w-5 text-violet-600" />
                    <h2 className="text-xl font-bold">How It Works</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left text-sm">
                    <div className="flex gap-2">
                      <Database className="h-5 w-5 text-violet-600 flex-shrink-0" />
                      <div>
                        <strong>RAG-Powered:</strong> Documents are chunked,
                        embedded, and stored in vector database
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Zap className="h-5 w-5 text-violet-600 flex-shrink-0" />
                      <div>
                        <strong>Semantic Search:</strong> Finds most relevant
                        chunks for your query
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Shield className="h-5 w-5 text-violet-600 flex-shrink-0" />
                      <div>
                        <strong>Private & Secure:</strong> Your data stays on
                        your infrastructure
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <FileText className="h-5 w-5 text-violet-600 flex-shrink-0" />
                      <div>
                        <strong>Source Citations:</strong> Every answer includes
                        document references
                      </div>
                    </div>
                  </div>
                </div>

                <UnifiedSettingsPanel onConfigChange={checkConfiguration}>
                  <Button
                    size="lg"
                    className="bg-violet-600 hover:bg-violet-700 rounded-xl font-semibold text-base px-8 py-6"
                  >
                    <Settings className="h-5 w-5 mr-2" />
                    Get Started - Open Settings
                  </Button>
                </UnifiedSettingsPanel>

                <p className="text-xs text-muted-foreground">
                  💡 Tip: Start with Ollama for free local AI, or use
                  OpenAI/Gemini for best quality
                </p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-2xl space-y-8 pb-32">
                <div className="flex flex-col items-center space-y-8">
                  <div className="flex items-center gap-4">
                    <h1 className="text-5xl font-black bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                      cogent-x
                    </h1>
                  </div>
                  <p className="text-xl font-semibold text-center">
                    How can I assist you today?
                  </p>
                </div>

                {/* Setup Status Banner */}
                <div className="bg-muted/30 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Setup Progress</p>
                    <span className="text-xs text-muted-foreground">1/2</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      {systemStatus.backend && systemStatus.llm ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm">Configure AI Provider</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      <span className="text-sm">Ingest Documentation</span>
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  <p className="text-xs font-semibold text-muted-foreground mb-3 text-center">
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
                          <span className="text-sm font-semibold text-foreground leading-relaxed pt-1">
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
                  <p className="text-sm font-medium text-muted-foreground truncate text-center">{conversationTitle}</p>
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
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 max-w-[85%] md:max-w-[70%] lg:max-w-[60%]">
                          <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-[15px] prose-p:leading-relaxed prose-p:my-1.5 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5 prose-strong:font-semibold prose-code:bg-background prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-background prose-pre:border prose-pre:border-border prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {message.sources && message.sources.length > 0 && (
                              <div className="flex gap-1.5">
                                {message.sources.map((source, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() =>
                                      setViewingSource({
                                        url: source.url,
                                        usedChunks: source.used_chunks.map(
                                          (c) => c.index
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
                              {copiedMessageId === message.id ? "Copied" : "Copy"}
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
                      <p className="text-sm text-muted-foreground font-medium">Thinking</p>
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
              className="font-semibold hover:text-sky-300 transition-colors"
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
              className="font-semibold hover:text-sky-300 transition-colors"
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
