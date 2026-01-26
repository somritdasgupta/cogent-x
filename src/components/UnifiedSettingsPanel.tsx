import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Bot,
  Sparkles,
  Globe,
  MessageSquare,
  Zap,
  Shield,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiGet, apiPost, apiPut } from "@/config/api";
import { SessionInfo } from "@/components/SessionInfo";

// Debounce utility to prevent excessive API calls
const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

interface Config {
  ollama_base_url: string;
  ollama_model: string;
  embedding_model_name: string;
  openai_api_key: string;
  openai_api_base_url: string;
  openai_model: string;
  openai_embedding_model: string;
  gemini_api_key: string;
  gemini_api_base_url: string;
  gemini_model: string;
  gemini_embedding_model: string;
  system_prompt: string;
  chunk_size: number;
  chunk_overlap: number;
  top_k_results: number;
}

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

interface UnifiedSettingsPanelProps {
  children?: React.ReactNode;
  onConfigChange?: () => void;
}

export const UnifiedSettingsPanel = ({
  children,
  onConfigChange,
}: UnifiedSettingsPanelProps = {}) => {
  const [config, setConfig] = useState<Config>({
    ollama_base_url: "http://localhost:11434",
    ollama_model: "llama3:8b",
    embedding_model_name: "BAAI/bge-large-en-v1.5",
    openai_api_key: "",
    openai_api_base_url: "https://api.openai.com/v1",
    openai_model: "gpt-4",
    openai_embedding_model: "text-embedding-3-small",
    gemini_api_key: "",
    gemini_api_base_url: "https://generativelanguage.googleapis.com/v1beta",
    gemini_model: "gemini-2.0-flash-exp",
    gemini_embedding_model: "models/text-embedding-004",
    system_prompt:
      "You are a helpful assistant that answers questions based on provided context. Be accurate, concise, and cite sources when possible.",
    chunk_size: 1000,
    chunk_overlap: 200,
    top_k_results: 5,
  });

  // Prevent status ref to avoid closing modal on status updates
  const statusRef = useRef<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });
  const isMountedRef = useRef(false);
  const allowCloseRef = useRef(false);

  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("providers");
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });
  const [stableIsReady, setStableIsReady] = useState(false);
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource",
  );
  const [url, setUrl] = useState("");
  const [ingestionMode, setIngestionMode] = useState<"url" | "manual">("url");
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [documentScope, setDocumentScope] = useState<"current" | "global">(
    "current",
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  // Fetch once on mount only
  useEffect(() => {
    const init = async () => {
      try {
        const [configRes, statusRes, kbRes, statsRes] = await Promise.all([
          apiGet(API_ENDPOINTS.CONFIG),
          apiGet(API_ENDPOINTS.HEALTH),
          apiGet(API_ENDPOINTS.KNOWLEDGE_BASES),
          apiGet(API_ENDPOINTS.DATABASE_STATS),
        ]);

        if (configRes.ok) {
          const data = await configRes.json();
          setConfig((prev) => ({ ...prev, ...data }));
        }
        if (statusRes.ok) {
          const newStatus = await statusRes.json();
          setStatus(newStatus);
          const newIsReady =
            newStatus.backend && newStatus.llm && newStatus.vectorDB;
          setStableIsReady(newIsReady);
        }
        if (kbRes.ok) {
          const data = await kbRes.json();
          setKnowledgeBases(data.knowledge_bases || []);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          setDbStats({
            total_documents: data.total_documents || 0,
            total_chunks: data.total_chunks || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setHasInitialLoad(true);
      }
    };
    init();
  }, []);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>([]);
  const [dbStats, setDbStats] = useState({
    total_documents: 0,
    total_chunks: 0,
  });
  const { toast } = useToast();

  // Controlled close function - only this can close the modal
  const closeModal = useCallback(() => {
    allowCloseRef.current = true;
    setIsOpen(false);
    // Reset flag after state update
    setTimeout(() => {
      allowCloseRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  const fetchAll = useCallback(async () => {
    if (isLoading) return; // Prevent concurrent fetches
    setIsLoading(true);
    try {
      const [configRes, statusRes, kbRes, statsRes] = await Promise.all([
        apiGet(API_ENDPOINTS.CONFIG),
        apiGet(API_ENDPOINTS.HEALTH),
        apiGet(API_ENDPOINTS.KNOWLEDGE_BASES),
        apiGet(API_ENDPOINTS.DATABASE_STATS),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig((prev) => ({ ...prev, ...data }));
      }
      if (statusRes.ok) {
        const newStatus = await statusRes.json();
        setStatus(newStatus);
        const newIsReady =
          newStatus.backend && newStatus.llm && newStatus.vectorDB;
        setStableIsReady(newIsReady);
      }
      if (kbRes.ok) {
        const data = await kbRes.json();
        setKnowledgeBases(data.knowledge_bases || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setDbStats({
          total_documents: data.total_documents || 0,
          total_chunks: data.total_chunks || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  useEffect(() => {
    // Don't auto-fetch, let user manually refresh if needed
  }, [isOpen]);

  const handleSave = useCallback(async () => {
    if (isSaving) return; // Prevent double-clicks
    setIsSaving(true);
    try {
      const response = await apiPut(API_ENDPOINTS.CONFIG, config);
      if (!response.ok) throw new Error("Failed to save");
      toast({
        title: "Configuration Saved",
        description: "Your settings have been updated successfully",
        className: "border-green-500/50 bg-green-50 dark:bg-green-950/30",
      });

      // Update status without closing modal
      try {
        const statusRes = await apiGet(API_ENDPOINTS.HEALTH);
        if (statusRes.ok) {
          const newStatus = await statusRes.json();
          setStatus(newStatus);
          const newIsReady =
            newStatus.backend && newStatus.llm && newStatus.vectorDB;
          setStableIsReady(newIsReady);
        }
      } catch (error) {
        console.error("Failed to update status:", error);
      }

      // Auto-navigate to ingestion tab after saving provider config
      if (activeTab === "providers" && status.vectorDB) {
        setTimeout(() => setActiveTab("ingestion"), 500);
      }

      onConfigChange?.();
    } catch {
      toast({
        title: "Save Failed",
        description: "Unable to update configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [config, activeTab, status, toast, onConfigChange, isSaving]);

  const handleIngestion = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (ingestionMode === "url" && !url.trim()) {
        toast({
          title: "Error",
          description: "Please enter a valid URL",
          variant: "destructive",
        });
        return;
      }
      if (ingestionMode === "manual" && !manualContent.trim()) {
        toast({
          title: "Content Required",
          description: "Please paste some content to ingest",
          variant: "destructive",
        });
        return;
      }

      setIsProcessing(true);
      console.log("Starting ingestion:", {
        mode: ingestionMode,
        provider: aiProvider,
        scope: documentScope,
      });

      try {
        const conversationId =
          documentScope === "current"
            ? localStorage.getItem("current_conversation_id") || "default"
            : "global";

        console.log("Sending request with conversation_id:", conversationId);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

        const endpoint =
          ingestionMode === "url"
            ? API_ENDPOINTS.INGEST
            : `${API_ENDPOINTS.INGEST}/manual`;
        const payload =
          ingestionMode === "url"
            ? {
                url: url.trim(),
                provider: aiProvider,
                conversation_id: conversationId,
              }
            : {
                title: manualTitle.trim() || "Manual Document",
                content: manualContent.trim(),
                provider: aiProvider,
                conversation_id: conversationId,
              };

        const response = await apiPost(endpoint, payload, controller.signal);

        clearTimeout(timeoutId);
        console.log("Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response:", errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { detail: errorText || "Ingestion failed" };
          }
          throw new Error(errorData.detail || "Ingestion failed");
        }

        const result = await response.json();
        console.log("Ingestion success:", result);

        toast({
          title: "Document Ingested",
          description: `Successfully processed ${
            result.chunks_created || 0
          } chunks`,
          className: "border-green-500/50 bg-green-50 dark:bg-green-950/30",
        });

        // Clear inputs
        if (ingestionMode === "url") {
          setUrl("");
        } else {
          setManualTitle("");
          setManualContent("");
        }

        // Don't call fetchAll while modal is open - it causes re-renders that close the modal
        // Instead, just update the stats we need without triggering full re-render
        try {
          const statsRes = await apiGet(API_ENDPOINTS.DATABASE_STATS);
          if (statsRes.ok) {
            const data = await statsRes.json();
            setDbStats({
              total_documents: data.total_documents || 0,
              total_chunks: data.total_chunks || 0,
            });
          }
        } catch (error) {
          console.error("Failed to update stats:", error);
        }

        // Auto-navigate to RAG tab after first ingestion
        if (activeTab === "ingestion") {
          setTimeout(() => setActiveTab("rag"), 100);
        }
      } catch (error) {
        console.error("Ingestion error:", error);
        const errorMsg =
          (error as Error).name === "AbortError"
            ? "Request timeout - document too large or server slow"
            : error instanceof Error
              ? error.message
              : "Ingestion failed";
        toast({
          title: "Ingestion Failed",
          description: errorMsg,
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [
      ingestionMode,
      url,
      manualContent,
      manualTitle,
      aiProvider,
      documentScope,
      toast,
      activeTab,
    ],
  );

  const maskKey = (key: string) =>
    key && key.length > 8
      ? key.substring(0, 4) +
        "•".repeat(key.length - 8) +
        key.substring(key.length - 4)
      : key;
  const isReady = status.backend && status.llm && status.vectorDB;

  // Stable config updater to prevent re-renders from closing modal
  const updateConfig = useCallback((updates: Partial<Config>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Memoize trigger button to prevent modal from closing on parent re-renders
  const defaultTrigger = useMemo(
    () => (
      <Button variant="outline" size="sm" className="gap-2">
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">Settings</span>
        {stableIsReady ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
        )}
      </Button>
    ),
    [stableIsReady],
  );

  const content = (
    <>
      {!hasInitialLoad ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading settings...</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Refreshing...</p>
        </div>
      ) : (
        <>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-slate-900/50 border border-slate-800">
              <TabsTrigger
                value="ingestion"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-sky-400 gap-2 py-3 text-slate-400"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Ingest</span>
              </TabsTrigger>
              <TabsTrigger
                value="providers"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-sky-400 gap-2 py-3 text-slate-400"
              >
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">Providers</span>
              </TabsTrigger>
              <TabsTrigger
                value="rag"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-sky-400 gap-2 py-3 text-slate-400"
              >
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">RAG</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ingestion" className="space-y-6 mt-6">
              <Card className="border-2 border-slate-800 bg-slate-900/50">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="flex items-center gap-2 text-sky-400">
                    <Upload className="h-5 w-5" />
                    Document Ingestion
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Add web documents to your knowledge base
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="space-y-3">
                    <Label
                      htmlFor="ai_provider"
                      className="text-base font-semibold flex items-center gap-2 text-slate-300"
                    >
                      <Sparkles className="h-4 w-4 text-sky-400" />
                      AI Provider
                    </Label>
                    <Select value={aiProvider} onValueChange={setAiProvider}>
                      <SelectTrigger
                        id="ai_provider"
                        className="h-11 bg-slate-800 border-slate-700 text-slate-300"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem
                          value="opensource"
                          className="text-slate-300 focus:bg-slate-800 focus:text-sky-400"
                        >
                          Ollama (Local & Free)
                        </SelectItem>
                        <SelectItem
                          value="openai"
                          className="text-slate-300 focus:bg-slate-800 focus:text-sky-400"
                        >
                          OpenAI GPT
                        </SelectItem>
                        <SelectItem
                          value="gemini"
                          className="text-slate-300 focus:bg-slate-800 focus:text-sky-400"
                        >
                          Google Gemini
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base font-semibold flex items-center gap-2 text-slate-300">
                      <Shield className="h-4 w-4 text-sky-400" />
                      Document Scope
                    </Label>
                    <RadioGroup
                      value={documentScope}
                      onValueChange={(v) =>
                        setDocumentScope(v as "current" | "global")
                      }
                      className="space-y-2"
                    >
                      <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
                        <RadioGroupItem
                          value="current"
                          id="scope-current"
                          className="mt-1 border-slate-600 text-sky-400"
                        />
                        <Label
                          htmlFor="scope-current"
                          className="flex-1 cursor-pointer space-y-1"
                        >
                          <div className="flex items-center gap-2 font-semibold text-slate-300">
                            <MessageSquare className="h-4 w-4 text-sky-400" />
                            Current Conversation Only
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Document will only be accessible in this specific
                            chat.
                          </p>
                        </Label>
                      </div>
                      <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
                        <RadioGroupItem
                          value="global"
                          id="scope-global"
                          className="mt-1 border-slate-600 text-sky-400"
                        />
                        <Label
                          htmlFor="scope-global"
                          className="flex-1 cursor-pointer space-y-1"
                        >
                          <div className="flex items-center gap-2 font-semibold text-slate-300">
                            <Globe className="h-4 w-4 text-sky-400" />
                            All Conversations
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Document will be available across all chats.
                          </p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-3 pt-2">
                    <Label className="text-base font-semibold text-slate-300">
                      Ingestion Method
                    </Label>
                    <RadioGroup
                      value={ingestionMode}
                      onValueChange={(value: "url" | "manual") =>
                        setIngestionMode(value)
                      }
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
                        <RadioGroupItem
                          value="url"
                          id="mode-url"
                          className="border-slate-600 text-sky-400"
                        />
                        <Label
                          htmlFor="mode-url"
                          className="flex-1 cursor-pointer font-medium text-slate-300"
                        >
                          <Globe className="h-4 w-4 inline mr-1.5 text-sky-400" />
                          Web URL
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
                        <RadioGroupItem
                          value="manual"
                          id="mode-manual"
                          className="border-slate-600 text-sky-400"
                        />
                        <Label
                          htmlFor="mode-manual"
                          className="flex-1 cursor-pointer font-medium text-slate-300"
                        >
                          <FileText className="h-4 w-4 inline mr-1.5 text-sky-400" />
                          Paste Text
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <form onSubmit={handleIngestion} className="space-y-3">
                    {ingestionMode === "url" ? (
                      <>
                        <Label
                          htmlFor="doc-url"
                          className="text-base font-semibold text-slate-300"
                        >
                          Document URL
                        </Label>
                        <Input
                          id="doc-url"
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://docs.example.com"
                          disabled={isProcessing}
                          className="h-11 bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500"
                        />
                      </>
                    ) : (
                      <>
                        <Label
                          htmlFor="doc-title"
                          className="text-base font-semibold text-slate-300"
                        >
                          Document Title (Optional)
                        </Label>
                        <Input
                          id="doc-title"
                          type="text"
                          value={manualTitle}
                          onChange={(e) => setManualTitle(e.target.value)}
                          placeholder="e.g., React Documentation"
                          disabled={isProcessing}
                          className="h-11 bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500"
                        />
                        <Label
                          htmlFor="doc-content"
                          className="text-base font-semibold text-slate-300"
                        >
                          Document Content
                        </Label>
                        <textarea
                          id="doc-content"
                          value={manualContent}
                          onChange={(e) => setManualContent(e.target.value)}
                          placeholder="Paste your documentation, article, or any text content here..."
                          disabled={isProcessing}
                          className="w-full min-h-[200px] px-3 py-2 text-sm border border-slate-700 rounded-md bg-slate-800 text-slate-300 placeholder:text-slate-500 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        />
                        <p className="text-xs text-slate-400">
                          Minimum 50 characters required
                        </p>
                      </>
                    )}
                    <Button
                      type="submit"
                      className="w-full h-12 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold shadow-lg shadow-sky-500/30"
                      disabled={
                        isProcessing ||
                        (ingestionMode === "url"
                          ? !url.trim()
                          : !manualContent.trim())
                      }
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-5 w-5" />
                          Ingest Document
                        </>
                      )}
                    </Button>
                  </form>

                  {knowledgeBases.length > 0 && (
                    <div className="space-y-3 pt-6 border-t border-slate-700">
                      <Label className="text-sm font-semibold text-sky-400 flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Recently Ingested ({knowledgeBases.length})
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {knowledgeBases.map((kb, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="px-3 py-1.5 bg-slate-800 text-sky-400 border border-slate-700"
                          >
                            <FileText className="h-3 w-3 mr-1.5" />
                            {kb}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="flex items-center gap-2 text-sky-400">
                    <CheckCircle2 className="h-5 w-5" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-6">
                  {[
                    { label: "Backend API", status: status.backend },
                    { label: "LLM Service", status: status.llm },
                    { label: "Vector Database", status: status.vectorDB },
                  ].map(({ label, status: s }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700"
                    >
                      <span className="font-medium text-slate-300">
                        {label}
                      </span>
                      <Badge variant={s ? "default" : "destructive"}>
                        {s ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertCircle className="h-3 w-3 mr-1" />
                        )}
                        {s ? "Online" : "Offline"}
                      </Badge>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchAll}
                    className="w-full bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700 hover:text-sky-300 hover:border-sky-500/50"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="flex items-center gap-2 text-sky-400">
                    <Database className="h-5 w-5" />
                    Knowledge Base
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                      <div className="text-3xl font-bold text-sky-400">
                        {dbStats.total_documents}
                      </div>
                      <div className="text-sm font-medium mt-1 text-slate-400">
                        Documents
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                      <div className="text-3xl font-bold text-sky-400">
                        {dbStats.total_chunks}
                      </div>
                      <div className="text-sm font-medium mt-1 text-slate-400">
                        Chunks
                      </div>
                    </div>
                  </div>

                  <SessionInfo onRefresh={fetchAll} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="providers" className="space-y-6 mt-6">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="text-sky-400">Ollama</CardTitle>
                  <CardDescription className="text-slate-400">
                    Free, local AI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Base URL</Label>
                    <Input
                      value={config.ollama_base_url}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ollama_base_url: e.target.value,
                        })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                    <p className="text-xs text-slate-400">
                      Local Ollama server endpoint.{" "}
                      <a
                        href="https://github.com/ollama/ollama/blob/main/docs/api.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 underline"
                      >
                        Docs →
                      </a>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Model</Label>
                    <Input
                      value={config.ollama_model}
                      onChange={(e) =>
                        setConfig({ ...config, ollama_model: e.target.value })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Embedding Model</Label>
                    <Input
                      value={config.embedding_model_name}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          embedding_model_name: e.target.value,
                        })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="text-sky-400">OpenAI</CardTitle>
                  <CardDescription className="text-slate-400">
                    GPT models
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <Alert className="bg-sky-950/30 border-sky-500/30">
                    <Shield className="h-4 w-4 text-sky-400" />
                    <AlertDescription className="text-xs text-slate-300">
                      API keys are session-only and never shared between users
                      or saved to disk for security.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label className="text-slate-300">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showOpenAIKey ? "text" : "password"}
                        value={
                          showOpenAIKey
                            ? config.openai_api_key
                            : maskKey(config.openai_api_key)
                        }
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            openai_api_key: e.target.value,
                          })
                        }
                        className="pr-10 bg-slate-800 border-slate-700 text-slate-300"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full hover:bg-slate-700"
                        onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                      >
                        {showOpenAIKey ? (
                          <EyeOff className="h-4 w-4 text-slate-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-slate-400" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">API Base URL</Label>
                    <Input
                      value={config.openai_api_base_url}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          openai_api_base_url: e.target.value,
                        })
                      }
                      placeholder="https://api.openai.com/v1"
                      className="font-mono text-sm bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500"
                    />
                    <p className="text-xs text-slate-400">
                      OpenAI API endpoint - useful for proxies or Azure OpenAI.{" "}
                      <a
                        href="https://platform.openai.com/docs/api-reference/introduction"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 underline"
                      >
                        Docs →
                      </a>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Model</Label>
                    <Input
                      value={config.openai_model}
                      onChange={(e) =>
                        setConfig({ ...config, openai_model: e.target.value })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Embedding Model</Label>
                    <Input
                      value={config.openai_embedding_model}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          openai_embedding_model: e.target.value,
                        })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="text-sky-400">Gemini</CardTitle>
                  <CardDescription className="text-slate-400">
                    Google AI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <Alert className="bg-sky-950/30 border-sky-500/30">
                    <Shield className="h-4 w-4 text-sky-400" />
                    <AlertDescription className="text-xs text-slate-300">
                      API keys are session-only and never shared between users
                      or saved to disk for security.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label className="text-slate-300">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showGeminiKey ? "text" : "password"}
                        value={
                          showGeminiKey
                            ? config.gemini_api_key
                            : maskKey(config.gemini_api_key)
                        }
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            gemini_api_key: e.target.value,
                          })
                        }
                        placeholder="AIzaSy..."
                        className="pr-10 bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full hover:bg-slate-700"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                      >
                        {showGeminiKey ? (
                          <EyeOff className="h-4 w-4 text-slate-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-slate-400" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">API Base URL</Label>
                    <Input
                      value={config.gemini_api_base_url}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          gemini_api_base_url: e.target.value,
                        })
                      }
                      placeholder="https://generativelanguage.googleapis.com/v1beta"
                      className="font-mono text-sm bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500"
                    />
                    <p className="text-xs text-slate-400">
                      Gemini API endpoint. Note: SDK doesn't support custom URLs
                      yet.{" "}
                      <a
                        href="https://ai.google.dev/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 underline"
                      >
                        Docs →
                      </a>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Model</Label>
                    <Input
                      value={config.gemini_model}
                      onChange={(e) =>
                        setConfig({ ...config, gemini_model: e.target.value })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Embedding Model</Label>
                    <Input
                      value={config.gemini_embedding_model}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          gemini_embedding_model: e.target.value,
                        })
                      }
                      className="bg-slate-800 border-slate-700 text-slate-300"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rag" className="space-y-6 mt-6">
              <Alert className="border-sky-500/50 bg-slate-800/50">
                <Info className="h-4 w-4 text-sky-400" />
                <AlertDescription className="text-sm text-slate-300">
                  Configure AI behavior and retrieval settings. All changes
                  apply to all providers.
                </AlertDescription>
              </Alert>

              {/* System Prompt */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="flex items-center gap-2 text-sky-400">
                    <MessageSquare className="h-5 w-5" />
                    System Prompt
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Define how the AI should respond - personality, tone, and
                    format
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm font-semibold">
                      Custom Instructions
                    </Label>
                    <Textarea
                      value={config.system_prompt}
                      onChange={(e) =>
                        setConfig({ ...config, system_prompt: e.target.value })
                      }
                      placeholder="You are a helpful assistant that answers questions based on provided context. Be accurate, concise, and cite sources when possible."
                      className="min-h-[100px] bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500 resize-y"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig({
                          ...config,
                          system_prompt:
                            "You are a helpful assistant that answers questions based on provided context. Be accurate, concise, and cite sources when possible.",
                        })
                      }
                      className="bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700 hover:text-sky-300 hover:border-sky-500/50"
                    >
                      Default
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfig({
                          ...config,
                          system_prompt:
                            "You are a concise technical assistant. Provide direct answers with code examples when relevant. Use bullet points for clarity. Always cite sources.",
                        })
                      }
                      className="bg-slate-800 border-slate-700 text-sky-400 hover:bg-slate-700 hover:text-sky-300 hover:border-sky-500/50"
                    >
                      Technical
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Document Processing */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="flex items-center gap-2 text-sky-400">
                    <FileText className="h-5 w-5" />
                    Document Processing
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Control how documents are split and indexed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-slate-300 text-sm font-semibold">
                          Chunk Size
                        </Label>
                        <p className="text-xs text-slate-400 mt-1">
                          Characters per document chunk
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-base font-bold px-3 py-1.5 bg-sky-400/20 text-sky-400 border border-sky-400/30"
                      >
                        {config.chunk_size}{" "}
                        <span className="text-xs font-normal ml-1">chars</span>
                      </Badge>
                    </div>
                    <Slider
                      value={[config.chunk_size]}
                      onValueChange={([v]) => updateConfig({ chunk_size: v })}
                      min={500}
                      max={2000}
                      step={100}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>500</span>
                      <span>2000</span>
                    </div>
                  </div>

                  <Separator className="bg-slate-700/50" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-slate-300 text-sm font-semibold">
                          Chunk Overlap
                        </Label>
                        <p className="text-xs text-slate-400 mt-1">
                          Overlapping characters between chunks
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-base font-bold px-3 py-1.5 bg-sky-400/20 text-sky-400 border border-sky-400/30"
                      >
                        {config.chunk_overlap}{" "}
                        <span className="text-xs font-normal ml-1">chars</span>
                      </Badge>
                    </div>
                    <Slider
                      value={[config.chunk_overlap]}
                      onValueChange={([v]) =>
                        updateConfig({ chunk_overlap: v })
                      }
                      min={0}
                      max={500}
                      step={50}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>0</span>
                      <span>500</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Retrieval Settings */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                  <CardTitle className="flex items-center gap-2 text-sky-400">
                    <Database className="h-5 w-5" />
                    Retrieval Settings
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Control how many context chunks are retrieved
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-slate-300 text-sm font-semibold">
                        Top K Results
                      </Label>
                      <p className="text-xs text-slate-400 mt-1">
                        Number of relevant chunks to retrieve
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-base font-bold px-3 py-1.5 bg-sky-400/20 text-sky-400 border border-sky-400/30"
                    >
                      {config.top_k_results}{" "}
                      <span className="text-xs font-normal ml-1">chunks</span>
                    </Badge>
                  </div>
                  <Slider
                    value={[config.top_k_results]}
                    onValueChange={([v]) => updateConfig({ top_k_results: v })}
                    min={1}
                    max={10}
                    step={1}
                    className="py-2"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 pt-8 pb-6 mt-8">
            {activeTab === "rag" && status.llm && status.vectorDB ? (
              <Button
                type="button"
                onClick={closeModal}
                className="w-full h-12 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold shadow-2xl shadow-sky-500/40 rounded-xl"
                size="lg"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Setup Complete
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full h-12 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold shadow-2xl shadow-sky-500/40 rounded-xl disabled:opacity-50"
                size="lg"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5 mr-2" />
                    {activeTab === "providers"
                      ? "Save & Continue"
                      : "Save All Changes"}
                  </>
                )}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !allowCloseRef.current) {
            // Block close unless explicitly allowed
            return;
          }
          setIsOpen(open);
        }}
        modal={true}
        dismissible={true}
        shouldScaleBackground={false}
      >
        <DrawerTrigger asChild onClick={() => setIsOpen(true)}>
          {children || defaultTrigger}
        </DrawerTrigger>
        <DrawerContent className="h-[85vh] bg-slate-950 border-slate-800 [&>div:first-child]:bg-slate-400 [&>div:first-child]:h-1.5 [&>div:first-child]:w-[100px]">
          <div className="overflow-y-auto px-4 pb-6 pt-2">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !allowCloseRef.current) {
          // Block close unless explicitly allowed via closeModal()
          return;
        }
        setIsOpen(open);
      }}
      modal={true}
    >
      <SheetTrigger asChild onClick={() => setIsOpen(true)}>
        {children || defaultTrigger}
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-full sm:max-w-3xl overflow-y-auto bg-slate-950 border-slate-800 rounded-tr-2xl rounded-br-2xl"
      >
        {content}
      </SheetContent>
    </Sheet>
  );
};
