import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface Config {
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
    openai_model: "gpt-4",
    openai_embedding_model: "text-embedding-3-small",
    gemini_api_key: "",
    gemini_model: "gemini-2.0-flash-exp",
    gemini_embedding_model: "models/text-embedding-004",
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
    () => localStorage.getItem("aiProvider") || "opensource"
  );
  const [url, setUrl] = useState("");
  const [ingestionMode, setIngestionMode] = useState<"url" | "manual">("url");
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [documentScope, setDocumentScope] = useState<"current" | "global">(
    "current"
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

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  const fetchAll = async () => {
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
  };

  useEffect(() => {
    // Don't auto-fetch, let user manually refresh if needed
  }, [isOpen]);

  const handleSave = async () => {
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
      if (activeTab === "providers" && !status.vectorDB) {
        setTimeout(() => setActiveTab("ingestion"), 100);
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
  };

  const handleIngestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (ingestionMode === "url" && !url.trim()) return;
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
  };

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
    [stableIsReady]
  );

  const content = (
    <>
      <SheetHeader className="pb-4">
        <SheetTitle className="text-xl font-bold">Settings</SheetTitle>
      </SheetHeader>

      {!hasInitialLoad ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Refreshing...</p>
        </div>
      ) : (
        <>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/50">
              <TabsTrigger
                value="ingestion"
                className="data-[state=active]:bg-background gap-2 py-3"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Ingest</span>
              </TabsTrigger>
              <TabsTrigger
                value="providers"
                className="data-[state=active]:bg-background gap-2 py-3"
              >
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">Providers</span>
              </TabsTrigger>
              <TabsTrigger
                value="rag"
                className="data-[state=active]:bg-background gap-2 py-3"
              >
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">RAG</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ingestion" className="space-y-6 mt-6">
              <Card className="border-2 border-primary/20">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-blue-600" />
                    Document Ingestion
                  </CardTitle>
                  <CardDescription>
                    Add web documents to your knowledge base
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="space-y-3">
                    <Label
                      htmlFor="ai_provider"
                      className="text-base font-semibold flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      AI Provider
                    </Label>
                    <Select value={aiProvider} onValueChange={setAiProvider}>
                      <SelectTrigger id="ai_provider" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opensource">
                          Ollama (Local & Free)
                        </SelectItem>
                        <SelectItem value="openai">OpenAI GPT</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-600" />
                      Document Scope
                    </Label>
                    <RadioGroup
                      value={documentScope}
                      onValueChange={(v) =>
                        setDocumentScope(v as "current" | "global")
                      }
                      className="space-y-2"
                    >
                      <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer">
                        <RadioGroupItem
                          value="current"
                          id="scope-current"
                          className="mt-1"
                        />
                        <Label
                          htmlFor="scope-current"
                          className="flex-1 cursor-pointer space-y-1"
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <MessageSquare className="h-4 w-4 text-blue-600" />
                            Current Conversation Only
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Document will only be accessible in this specific
                            chat.
                          </p>
                        </Label>
                      </div>
                      <div className="flex items-start space-x-3 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer">
                        <RadioGroupItem
                          value="global"
                          id="scope-global"
                          className="mt-1"
                        />
                        <Label
                          htmlFor="scope-global"
                          className="flex-1 cursor-pointer space-y-1"
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <Globe className="h-4 w-4 text-purple-600" />
                            All Conversations
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Document will be available across all chats.
                          </p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-3 pt-2">
                    <Label className="text-base font-semibold">
                      Ingestion Method
                    </Label>
                    <RadioGroup
                      value={ingestionMode}
                      onValueChange={(value: "url" | "manual") =>
                        setIngestionMode(value)
                      }
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer">
                        <RadioGroupItem value="url" id="mode-url" />
                        <Label
                          htmlFor="mode-url"
                          className="flex-1 cursor-pointer font-medium"
                        >
                          <Globe className="h-4 w-4 inline mr-1.5" />
                          Web URL
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer">
                        <RadioGroupItem value="manual" id="mode-manual" />
                        <Label
                          htmlFor="mode-manual"
                          className="flex-1 cursor-pointer font-medium"
                        >
                          <FileText className="h-4 w-4 inline mr-1.5" />
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
                          className="text-base font-semibold"
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
                          className="h-11"
                        />
                      </>
                    ) : (
                      <>
                        <Label
                          htmlFor="doc-title"
                          className="text-base font-semibold"
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
                          className="h-11"
                        />
                        <Label
                          htmlFor="doc-content"
                          className="text-base font-semibold"
                        >
                          Document Content
                        </Label>
                        <textarea
                          id="doc-content"
                          value={manualContent}
                          onChange={(e) => setManualContent(e.target.value)}
                          placeholder="Paste your documentation, article, or any text content here..."
                          disabled={isProcessing}
                          className="w-full min-h-[200px] px-3 py-2 text-sm border border-input rounded-md bg-background resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum 50 characters required
                        </p>
                      </>
                    )}
                    <Button
                      type="submit"
                      className="w-full h-11"
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
                    <div className="space-y-3 pt-4 border-t">
                      <Label className="text-sm font-semibold text-muted-foreground">
                        Recently Ingested ({knowledgeBases.length})
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {knowledgeBases.map((kb, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="px-3 py-1.5"
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

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Backend API", status: status.backend },
                    { label: "LLM Service", status: status.llm },
                    { label: "Vector Database", status: status.vectorDB },
                  ].map(({ label, status: s }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border"
                    >
                      <span className="font-medium">{label}</span>
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
                    variant="outline"
                    size="sm"
                    onClick={fetchAll}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-600" />
                    Knowledge Base
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 border">
                      <div className="text-3xl font-bold">
                        {dbStats.total_documents}
                      </div>
                      <div className="text-sm font-medium mt-1">Documents</div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border">
                      <div className="text-3xl font-bold">
                        {dbStats.total_chunks}
                      </div>
                      <div className="text-sm font-medium mt-1">Chunks</div>
                    </div>
                  </div>
                  <SessionInfo />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear All Data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all documents and chunks
                          from your knowledge base. This action cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            try {
                              await apiPost(API_ENDPOINTS.DATABASE_CLEAR);
                              fetchAll();
                              toast({
                                title: "Data Cleared",
                                description: "All documents have been removed",
                                className:
                                  "border-green-500/50 bg-green-50 dark:bg-green-950/30",
                              });
                            } catch {
                              toast({
                                title: "Clear Failed",
                                description:
                                  "Unable to clear data. Please try again.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          Clear Data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="providers" className="space-y-6 mt-6">
              <Card>
                <CardHeader className="bg-emerald-50 dark:bg-emerald-950/30">
                  <CardTitle>Ollama</CardTitle>
                  <CardDescription>Free, local AI</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label>Base URL</Label>
                    <Input
                      value={config.ollama_base_url}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ollama_base_url: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input
                      value={config.ollama_model}
                      onChange={(e) =>
                        setConfig({ ...config, ollama_model: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Embedding Model</Label>
                    <Input
                      value={config.embedding_model_name}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          embedding_model_name: e.target.value,
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="bg-blue-50 dark:bg-blue-950/30">
                  <CardTitle>OpenAI</CardTitle>
                  <CardDescription>GPT models</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label>API Key</Label>
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
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input
                      value={config.openai_model}
                      onChange={(e) =>
                        setConfig({ ...config, openai_model: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Embedding Model</Label>
                    <Input
                      value={config.openai_embedding_model}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          openai_embedding_model: e.target.value,
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="bg-purple-50 dark:bg-purple-950/30">
                  <CardTitle>Gemini</CardTitle>
                  <CardDescription>Google AI</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label>API Key</Label>
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
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input
                      value={config.gemini_model}
                      onChange={(e) =>
                        setConfig({ ...config, gemini_model: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Embedding Model</Label>
                    <Input
                      value={config.gemini_embedding_model}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          gemini_embedding_model: e.target.value,
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rag" className="space-y-6 mt-6">
              <Alert className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/30">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm">
                  These settings apply to all AI providers.
                </AlertDescription>
              </Alert>

              {[
                {
                  label: "Chunk Size",
                  value: config.chunk_size,
                  key: "chunk_size",
                  min: 500,
                  max: 2000,
                  step: 100,
                  unit: "chars",
                },
                {
                  label: "Chunk Overlap",
                  value: config.chunk_overlap,
                  key: "chunk_overlap",
                  min: 0,
                  max: 500,
                  step: 50,
                  unit: "chars",
                },
                {
                  label: "Top K Results",
                  value: config.top_k_results,
                  key: "top_k_results",
                  min: 1,
                  max: 10,
                  step: 1,
                  unit: "chunks",
                },
              ].map(({ label, value, key, min, max, step, unit }) => (
                <Card key={key}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{label}</CardTitle>
                      <Badge
                        variant="secondary"
                        className="text-lg font-bold px-4 py-2"
                      >
                        {value}{" "}
                        <span className="text-xs font-normal ml-1">{unit}</span>
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Slider
                      value={[value]}
                      onValueChange={([v]) => updateConfig({ [key]: v })}
                      min={min}
                      max={max}
                      step={step}
                      className="py-4"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>{min}</span>
                      <span>{max}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 pt-6 pb-2 bg-gradient-to-t from-background via-background to-transparent">
            {activeTab === "rag" && status.llm && status.vectorDB ? (
              <Button
                onClick={() => setIsOpen(false)}
                className="w-full h-12"
                size="lg"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Setup Complete
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full h-12"
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
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>{children || defaultTrigger}</DrawerTrigger>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <div className="overflow-y-auto px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{children || defaultTrigger}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        {content}
      </SheetContent>
    </Sheet>
  );
};
