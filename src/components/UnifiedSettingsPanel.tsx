import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Settings,
  Save,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Upload,
  Loader2,
  FileText,
  Database,
  Trash2,
  RefreshCw,
  CheckCircle,
  Monitor,
  Bot,
  Activity,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  API_ENDPOINTS,
  buildApiUrl,
  buildApiUrlWithParams,
  getApiBaseUrl,
  apiGet,
  apiPost,
  apiPut,
} from "@/config/api";
import { SessionInfo } from "@/components/SessionInfo";

interface Configuration {
  ollama_base_url: string;
  ollama_model: string;
  embedding_model_name: string;
  openai_api_key: string;
  openai_model: string;
  openai_embedding_model: string;
  gemini_api_key: string;
  gemini_model: string;
  gemini_embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  top_k_results: number;
}

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

interface DatabaseStats {
  total_documents: number;
  total_chunks: number;
  collections: string[];
}

interface Source {
  url: string;
  chunks: number;
}

interface SourceChunk {
  content: string;
  metadata: Record<string, string>;
  index: number;
}

interface UnifiedSettingsPanelProps {
  children?: React.ReactNode;
  onConfigChange?: () => void;
  inSidebar?: boolean;
}

export const UnifiedSettingsPanel = ({ children, onConfigChange, inSidebar }: UnifiedSettingsPanelProps = {}) => {
  // Configuration state
  const [config, setConfig] = useState<Configuration>({
    ollama_base_url: "http://localhost:11434",
    ollama_model: "llama3:8b",
    embedding_model_name: "BAAI/bge-large-en-v1.5",
    openai_api_key: "",
    openai_model: "gpt-4",
    openai_embedding_model: "text-embedding-3-small",
    gemini_api_key: "",
    gemini_model: "gemini-2.5-flash",
    gemini_embedding_model: "models/text-embedding-004",
    chunk_size: 1000,
    chunk_overlap: 200,
    top_k_results: 5,
  });

  // System status state
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });

  // Database stats
  const [dbStats, setDbStats] = useState<DatabaseStats>({
    total_documents: 0,
    total_chunks: 0,
    collections: [],
  });

  // Sources state
  const [sources, setSources] = useState<Source[]>([]);
  const [isDeletingSource, setIsDeletingSource] = useState<string | null>(null);
  const [viewingSource, setViewingSource] = useState<string | null>(null);
  const [sourceChunks, setSourceChunks] = useState<SourceChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);

  // Document ingestion state
  const [url, setUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>([]);
  const [isLoadingKB, setIsLoadingKB] = useState(true);

  // AI Provider state
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource"
  );

  // UI state
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"success" | "error" | null>(
    null
  );
  const { toast } = useToast();

  // Save AI provider to localStorage
  useEffect(() => {
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  // Fetch configuration
  const fetchConfiguration = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiGet(API_ENDPOINTS.CONFIG);
      if (response.ok) {
        const data = await response.json();
        setConfig((prev) => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error("Failed to fetch configuration:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check system status
  const checkStatus = useCallback(async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.HEALTH);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        // Silent refresh - no toast notification
      } else {
        throw new Error("Failed to fetch status");
      }
    } catch (error) {
      console.error("Health check failed:", error);
      // Don't show toast on auto-refresh, only log error
    }
  }, []);

  // Fetch knowledge bases
  const fetchKnowledgeBases = useCallback(async () => {
    try {
      setIsLoadingKB(true);
      const response = await apiGet(API_ENDPOINTS.KNOWLEDGE_BASES);
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBases(data.knowledge_bases || []);
      }
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error);
    } finally {
      setIsLoadingKB(false);
    }
  }, []);

  // Fetch database stats
  const fetchDatabaseStats = useCallback(async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.DATABASE_STATS);
      if (response.ok) {
        const data = await response.json();
        setDbStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch database stats:", error);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.DATABASE_SOURCES);
      if (response.ok) {
        const data = await response.json();
        setSources(data.sources || []);
      }
    } catch (error) {
      console.error("Failed to fetch sources:", error);
    }
  }, []);

  // Initialize data
  useEffect(() => {
    fetchConfiguration();
    checkStatus();
    fetchKnowledgeBases();
    fetchDatabaseStats();
    fetchSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Save configuration
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const response = await apiPut(API_ENDPOINTS.CONFIG, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      setSaveStatus("success");
      toast({
        title: "Configuration Saved",
        description: "Settings updated successfully",
      });
    } catch (error) {
      setSaveStatus("error");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save configuration";
      console.error("Configuration save error:", error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Handle document ingestion
  const handleIngestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const conversationId = localStorage.getItem("current_conversation_id") || "default";
      const response = await apiPost(API_ENDPOINTS.INGEST, {
        url: url.trim(),
        provider: aiProvider,
        conversation_id: conversationId,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Ingestion failed");
      }

      const data = await response.json();

      toast({
        title: "Document Ingested",
        description: "Ready for queries",
      });

      setUrl("");
      fetchKnowledgeBases();
      fetchDatabaseStats();
      fetchSources();
      checkStatus(); // Update setup progress
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to ingest document",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear database
  const handleClearDatabase = async () => {
    if (
      !confirm(
        "Are you sure you want to clear all data from the vector database? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      const response = await apiPost(API_ENDPOINTS.DATABASE_CLEAR);

      if (!response.ok) {
        throw new Error("Failed to clear database");
      }

      // Silent success - UI will update automatically
      fetchKnowledgeBases();
      fetchDatabaseStats();
      fetchSources();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear database",
        variant: "destructive",
      });
    }
  };

  // Delete a specific source
  const handleDeleteSource = async (url: string) => {
    if (
      !confirm(
        `Are you sure you want to delete all data from "${url}"? This cannot be undone.`
      )
    ) {
      return;
    }

    setIsDeletingSource(url);

    try {
      const response = await fetch(
        buildApiUrlWithParams(API_ENDPOINTS.DATABASE_SOURCE, { url }),
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to delete source");
      }

      // Silent success - UI updates show the change
      fetchSources();
      fetchDatabaseStats();
      fetchKnowledgeBases();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete source",
        variant: "destructive",
      });
    } finally {
      setIsDeletingSource(null);
    }
  };

  // View source chunks
  const handleViewSource = async (url: string) => {
    setViewingSource(url);
    setIsLoadingChunks(true);
    setSourceChunks([]);

    try {
      const endpoint = `${
        API_ENDPOINTS.DATABASE_SOURCE_CHUNKS
      }?url=${encodeURIComponent(url)}`;
      const response = await apiGet(endpoint);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to load chunks");
      }

      const result = await response.json();
      setSourceChunks(result.chunks || []);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to load chunks",
        variant: "destructive",
      });
      setViewingSource(null);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const updateConfig = useCallback((key: keyof Configuration, value: string | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return (
      key.substring(0, 4) +
      "•".repeat(key.length - 8) +
      key.substring(key.length - 4)
    );
  };

  const isSystemReady = status.backend && status.llm && status.vectorDB;

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          {children || (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-slate-600 bg-slate-900 hover:bg-slate-800 hover:text-blue-200 text-slate-300"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
              {isSystemReady ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              )}
            </Button>
          )}
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Settings className="h-6 w-6 text-blue-600" />
              System Configuration
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 opacity-75 blur-md animate-pulse" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 border-r-purple-600 animate-spin" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Loading configuration...</p>
            </div>
          ) : (
            <Tabs defaultValue="providers" className="mt-6">
              <TabsList className="grid w-full grid-cols-3 mb-6 h-auto p-1">
                <TabsTrigger
                  value="providers"
                  className="text-xs sm:text-sm py-2 gap-1.5"
                >
                  <Bot className="h-4 w-4" /> 1. AI Provider
                </TabsTrigger>
                <TabsTrigger
                  value="rag"
                  className="text-xs sm:text-sm py-2 gap-1.5"
                >
                  <Settings className="h-4 w-4" /> 2. RAG Config
                </TabsTrigger>
                <TabsTrigger
                  value="system"
                  className="text-xs sm:text-sm py-2 gap-1.5"
                >
                  <Monitor className="h-4 w-4" /> 3. Ingestion
                </TabsTrigger>
              </TabsList>

              {/* System Status & Ingestion Tab */}
              <TabsContent value="system" className="space-y-6">
                {/* Document Ingestion - Highlighted at Top */}
                <div className="space-y-4 p-5 rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/40 dark:via-indigo-950/40 dark:to-purple-950/40 border-2 border-blue-200 dark:border-blue-800 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-600 text-white shadow-md">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        Document Ingestion
                      </h3>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Add web documents to your knowledge base
                      </p>
                    </div>
                  </div>

                  {/* AI Provider Selection */}
                  <div className="space-y-2 p-3 rounded-lg bg-white/50 dark:bg-slate-900/30 border border-blue-300 dark:border-blue-700">
                    <Label
                      htmlFor="ai_provider_ingest"
                      className="text-sm font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Active AI Provider
                    </Label>
                    <Select value={aiProvider} onValueChange={setAiProvider}>
                      <SelectTrigger
                        id="ai_provider_ingest"
                        className="h-10 border-blue-300 dark:border-blue-700"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opensource">
                          Open Source (Ollama)
                        </SelectItem>
                        <SelectItem value="openai">OpenAI GPT</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-blue-700 dark:text-blue-300">
                      {aiProvider === "openai"
                        ? "Using OpenAI GPT models for chat and embeddings"
                        : aiProvider === "gemini"
                        ? "Using Google Gemini models for chat"
                        : "Using local Ollama models for chat and Hugging Face for embeddings"}
                    </p>
                  </div>

                  <form onSubmit={handleIngestion} className="space-y-3">
                    <Input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://docs.example.com/page"
                      disabled={isProcessing}
                      className="h-12 text-base border-2 border-blue-300 dark:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                    />

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md"
                      disabled={isProcessing || !url.trim()}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Processing & Embedding...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-5 w-5" />
                          Ingest & Process Document
                        </>
                      )}
                    </Button>
                  </form>

                  <Alert className="bg-blue-100/50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
                      Documents are scraped, chunked (size: {config.chunk_size},
                      overlap: {config.chunk_overlap}), embedded, and stored for
                      semantic search.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        Recently Ingested
                      </h4>
                      {isLoadingKB && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      )}
                    </div>

                    {!isLoadingKB && knowledgeBases.length === 0 ? (
                      <p className="text-xs text-blue-700 dark:text-blue-300 py-2">
                        No documents ingested yet. Add a URL above to get
                        started.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {knowledgeBases.map((kb, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {kb}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="my-6" />

                {/* System Status */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        System Health
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Real-time status of all services
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkStatus}
                      disabled={isRefreshing}
                      className="gap-1.5"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 transition-transform duration-700 ${
                          isRefreshing ? "animate-spin" : "hover:rotate-180"
                        }`}
                      />
                      <span className="text-xs">
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 text-xs">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold block">Backend API</span>
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {(() => {
                            const url = getApiBaseUrl();
                            if (url) return url;
                            if (import.meta.env.DEV)
                              return "http://localhost:8000 (via proxy)";
                            return "VITE_API_BASE_URL not set";
                          })()}
                        </span>
                      </div>
                      {status.backend ? (
                        <Badge
                          variant="outline"
                          className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Online
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Offline
                        </Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50">
                      <div>
                        <span className="font-semibold block">LLM Service</span>
                        <span className="text-[10px] text-muted-foreground">
                          Selected AI provider ({aiProvider})
                        </span>
                      </div>
                      {status.llm ? (
                        <Badge
                          variant="outline"
                          className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Online
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Offline
                        </Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50">
                      <div>
                        <span className="font-semibold block">
                          Vector Database
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          FAISS index with embeddings
                        </span>
                      </div>
                      {status.vectorDB ? (
                        <Badge
                          variant="outline"
                          className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Online
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Offline
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* Vector Database & Session Management - Merged Card */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <Database className="h-4 w-4 text-purple-600" />
                        Knowledge Base & Session
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Manage your vector database, documents, and session
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        fetchDatabaseStats();
                        fetchSources();
                      }}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="text-xs">Refresh</span>
                    </Button>
                  </div>

                  {/* Stats Grid - 2x2 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 border border-purple-200 dark:border-purple-800 space-y-1">
                      <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                        {dbStats.total_documents}
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                        Documents
                      </div>
                    </div>
                    <div className="p-3.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border border-blue-200 dark:border-blue-800 space-y-1">
                      <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {dbStats.total_chunks}
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                        Vector Chunks
                      </div>
                    </div>
                  </div>

                  {/* Session Info Card */}
                  <SessionInfo />

                  {/* Sources List */}
                  <div className="space-y-3 mt-4">
                    <h4 className="text-sm font-semibold">Source Documents</h4>

                    {sources.length === 0 ? (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          No sources have been ingested yet. Use the Document
                          Ingestion section above to add sources.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {sources.map((source) => (
                          <div
                            key={source.url}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer group"
                            onClick={() => handleViewSource(source.url)}
                          >
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                {source.url}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {source.chunks} chunk
                                {source.chunks !== 1 ? "s" : ""} • Click to view
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewSource(source.url);
                                }}
                                className="text-primary hover:text-primary hover:bg-primary/10"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSource(source.url);
                                }}
                                disabled={isDeletingSource === source.url}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                {isDeletingSource === source.url ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Danger Zone */}
                  <div className="space-y-3 mt-6 p-4 rounded-lg border-2 border-destructive/20 bg-destructive/5">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <h4 className="text-sm font-semibold text-destructive">
                        Danger Zone
                      </h4>
                    </div>

                    <Alert
                      variant="destructive"
                      className="border-destructive/50"
                    >
                      <AlertDescription className="text-xs">
                        Clearing the database will permanently delete all
                        ingested documents and embeddings. This action cannot be
                        undone.
                      </AlertDescription>
                    </Alert>

                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={handleClearDatabase}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All Database Data
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ==================== RAG CONFIGURATION TAB ==================== */}
              {/* UNIVERSAL SETTINGS FOR ALL AI PROVIDERS */}
              <TabsContent value="rag" className="space-y-5">
                <Alert className="border-blue-500/30 bg-blue-500/5">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-xs">
                    <strong className="text-blue-900 dark:text-blue-100">
                      Universal Settings:
                    </strong>{" "}
                    These document processing settings apply to{" "}
                    <strong>ALL AI providers</strong> (Ollama, OpenAI, Gemini).
                    They control how your documents are split and retrieved.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3 p-4 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border-2 border-slate-200 dark:border-slate-700">
                  <div>
                    <Label className="text-sm font-semibold">
                      Chunk Size:{" "}
                      <span className="text-blue-600">{config.chunk_size}</span>{" "}
                      characters
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      How many characters per document chunk.{" "}
                      <strong>Larger = more context but less focused.</strong>
                    </p>
                  </div>
                  <Slider
                    value={[config.chunk_size]}
                    onValueChange={([value]) =>
                      updateConfig("chunk_size", value)
                    }
                    min={500}
                    max={2000}
                    step={100}
                    className="py-2"
                  />
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border-2 border-slate-200 dark:border-slate-700">
                  <div>
                    <Label className="text-sm font-semibold">
                      Chunk Overlap:{" "}
                      <span className="text-purple-600">
                        {config.chunk_overlap}
                      </span>{" "}
                      characters
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Characters shared between consecutive chunks.{" "}
                      <strong>Higher = better context continuity.</strong>
                    </p>
                  </div>
                  <Slider
                    value={[config.chunk_overlap]}
                    onValueChange={([value]) =>
                      updateConfig("chunk_overlap", value)
                    }
                    min={0}
                    max={500}
                    step={50}
                    className="py-2"
                  />
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border-2 border-slate-200 dark:border-slate-700">
                  <div>
                    <Label className="text-sm font-semibold">
                      Top K Results:{" "}
                      <span className="text-pink-600">
                        {config.top_k_results}
                      </span>{" "}
                      chunks
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      How many relevant chunks to retrieve per query.{" "}
                      <strong>More = richer context but slower.</strong>
                    </p>
                  </div>
                  <Slider
                    value={[config.top_k_results]}
                    onValueChange={([value]) =>
                      updateConfig("top_k_results", value)
                    }
                    min={1}
                    max={10}
                    step={1}
                    className="py-2"
                  />
                </div>

                <Separator />

                <div className="space-y-3 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/30 dark:via-purple-950/30 dark:to-pink-950/30 p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-blue-900 dark:text-blue-100">
                    <Database className="h-5 w-5 text-blue-600" />
                    How RAG Works (Step by Step)
                  </h4>
                  <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-2 ml-5 list-decimal leading-relaxed">
                    <li>
                      <strong>Document Chunking:</strong> Your documents are
                      split into chunks of{" "}
                      <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">
                        {config.chunk_size}
                      </span>{" "}
                      characters (with{" "}
                      <span className="font-mono bg-purple-100 dark:bg-purple-900 px-1 py-0.5 rounded">
                        {config.chunk_overlap}
                      </span>{" "}
                      character overlap)
                    </li>
                    <li>
                      <strong>Embedding Creation:</strong> Each chunk is
                      converted to a vector embedding using AI models
                    </li>
                    <li>
                      <strong>Database Storage:</strong> All embeddings are
                      stored in the FAISS vector database for fast retrieval
                    </li>
                    <li>
                      <strong>Query Processing:</strong> When you ask a
                      question, the top{" "}
                      <span className="font-mono bg-pink-100 dark:bg-pink-900 px-1 py-0.5 rounded">
                        {config.top_k_results}
                      </span>{" "}
                      most similar chunks are retrieved
                    </li>
                    <li>
                      <strong>Answer Generation:</strong> Retrieved chunks are
                      sent to your selected AI provider as context, and it
                      generates an answer based on your documents
                    </li>
                  </ol>
                </div>
              </TabsContent>

              {/* ==================== PROVIDERS TAB ==================== */}
              {/* ALL AI PROVIDER CONFIGURATIONS IN ONE PLACE */}
              <TabsContent value="providers" className="space-y-6">
                {/* Ollama Section */}
                <div className="space-y-4 p-5 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-200 dark:border-green-800 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-600 text-white shadow-md">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-green-900 dark:text-green-100">
                        Ollama (Open Source Local)
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-xs bg-white dark:bg-slate-900 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 mt-1"
                      >
                        Free • Runs Locally
                      </Badge>
                    </div>
                  </div>

                  <Alert className="bg-white/60 dark:bg-slate-900/40 border-green-300 dark:border-green-700">
                    <AlertCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-xs text-green-800 dark:text-green-200">
                      Ollama runs locally on your machine. Install from{" "}
                      <a
                        href="https://ollama.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline hover:text-green-600"
                      >
                        ollama.ai
                      </a>
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="ollama_url">Ollama Base URL</Label>
                    <Input
                      id="ollama_url"
                      placeholder="http://localhost:11434"
                      value={config.ollama_base_url}
                      onChange={(e) =>
                        updateConfig("ollama_base_url", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ollama_model">Chat Model</Label>
                    <Input
                      id="ollama_model"
                      placeholder="llama3:8b"
                      value={config.ollama_model}
                      onChange={(e) =>
                        updateConfig("ollama_model", e.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Examples: llama3:8b, mistral, codellama, phi3, qwen2.5
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="embedding_model">
                      Embedding Model (Hugging Face)
                    </Label>
                    <Input
                      id="embedding_model"
                      placeholder="BAAI/bge-large-en-v1.5"
                      value={config.embedding_model_name}
                      onChange={(e) =>
                        updateConfig("embedding_model_name", e.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Used by Ollama. Other options:
                      sentence-transformers/all-MiniLM-L6-v2
                    </p>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* OpenAI Section */}
                <div className="space-y-4 p-5 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-2 border-blue-200 dark:border-blue-800 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-600 text-white shadow-md">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        OpenAI GPT
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-xs bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 mt-1"
                      >
                        Paid API
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="openai_key">API Key</Label>
                    <div className="relative">
                      <Input
                        id="openai_key"
                        type={showOpenAIKey ? "text" : "password"}
                        placeholder="sk-..."
                        value={
                          showOpenAIKey
                            ? config.openai_api_key
                            : maskApiKey(config.openai_api_key)
                        }
                        onChange={(e) =>
                          updateConfig("openai_api_key", e.target.value)
                        }
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                      >
                        {showOpenAIKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get from{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        OpenAI Playground
                      </a>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="openai_model">Chat Model</Label>
                    <Input
                      id="openai_model"
                      type="text"
                      value={config.openai_model}
                      onChange={(e) =>
                        updateConfig("openai_model", e.target.value)
                      }
                      placeholder="e.g., gpt-4, gpt-4-turbo, gpt-4o, gpt-3.5-turbo"
                    />
                    <p className="text-xs text-muted-foreground">
                      Specify any OpenAI model name (supports new models as
                      they're released)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="openai_embedding">Embedding Model</Label>
                    <Input
                      id="openai_embedding"
                      type="text"
                      value={config.openai_embedding_model}
                      onChange={(e) =>
                        updateConfig("openai_embedding_model", e.target.value)
                      }
                      placeholder="e.g., text-embedding-3-small, text-embedding-3-large"
                    />
                    <p className="text-xs text-muted-foreground">
                      Specify any OpenAI embedding model name
                    </p>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* Gemini Section */}
                <div className="space-y-4 p-5 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-2 border-purple-200 dark:border-purple-800 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-purple-600 text-white shadow-md">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-purple-900 dark:text-purple-100">
                        Google Gemini
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-xs bg-white dark:bg-slate-900 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 mt-1"
                      >
                        Paid API
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gemini_key">API Key</Label>
                    <div className="relative">
                      <Input
                        id="gemini_key"
                        type={showGeminiKey ? "text" : "password"}
                        placeholder="AIza..."
                        value={
                          showGeminiKey
                            ? config.gemini_api_key
                            : maskApiKey(config.gemini_api_key)
                        }
                        onChange={(e) =>
                          updateConfig("gemini_api_key", e.target.value)
                        }
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                      >
                        {showGeminiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get from{" "}
                      <a
                        href="https://makersuite.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Google AI Studio
                      </a>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gemini_model">Chat Model</Label>
                    <Input
                      id="gemini_model"
                      type="text"
                      value={config.gemini_model}
                      onChange={(e) =>
                        updateConfig("gemini_model", e.target.value)
                      }
                      placeholder="e.g., gemini-pro, gemini-pro-vision, gemini-1.5-pro"
                    />
                    <p className="text-xs text-muted-foreground">
                      Specify any Gemini model name (supports new models as
                      they're released)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gemini_embedding_model">
                      Embedding Model
                    </Label>
                    <Input
                      id="gemini_embedding_model"
                      placeholder="e.g., models/text-embedding-004, models/embedding-001"
                      value={config.gemini_embedding_model}
                      onChange={(e) =>
                        updateConfig("gemini_embedding_model", e.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter any Gemini embedding model name (e.g.,
                      text-embedding-004, embedding-001)
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Keep old tabs hidden for backward compatibility but don't show them */}
              <TabsContent value="opensource" className="hidden">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This tab has been moved. Please use the "Providers" tab
                    instead.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="openai" className="hidden">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This tab has been moved. Please use the "Providers" tab
                    instead.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="gemini" className="hidden">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    This tab has been moved. Please use the "Providers" tab
                    instead.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>
          )}

          {!isLoading && (
            <>
              <Separator className="my-6" />

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Configuration
                    </>
                  )}
                </Button>

                {saveStatus === "success" && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {saveStatus === "error" && (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
              </div>

              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  After saving, restart the backend:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    docker-compose restart backend
                  </code>
                </AlertDescription>
              </Alert>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Source Chunks Dialog */}
      <Dialog
        open={viewingSource !== null}
        onOpenChange={(open) => !open && setViewingSource(null)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Source Chunks</DialogTitle>
            <DialogDescription className="text-xs truncate">
              {viewingSource}
            </DialogDescription>
          </DialogHeader>

          {isLoadingChunks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {sourceChunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg bg-muted/50 border border-border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">Chunk {idx + 1}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Index: {chunk.index}
                    </span>
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap font-mono">
                    {chunk.content}
                  </div>
                  {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                      <div className="text-xs text-muted-foreground font-semibold mb-1">
                        Metadata:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(chunk.metadata).map(([key, value]) => (
                          <Badge
                            key={key}
                            variant="secondary"
                            className="text-xs"
                          >
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {sourceChunks.length === 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    No chunks found for this source.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
