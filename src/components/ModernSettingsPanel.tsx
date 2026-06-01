import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { API_ENDPOINTS, apiGet, apiPost, apiPut } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import Logo from "@/components/Logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Globe,
  History,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { SiGooglegemini, SiOpenai, SiOllama } from "react-icons/si";

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

interface ConversationSummary {
  id: string;
  timestamp: string;
  preview: string;
  conversationId: string;
}

interface ModernSettingsPanelProps {
  children?: React.ReactNode;
  onConfigChange?: () => void;
  initialSection?: (typeof sections)[number]["id"];
  noSidebar?: boolean;
}

const defaultConfig: Config = {
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
};

const readConversationHistory = (): ConversationSummary[] => {
  try {
    const raw = localStorage.getItem("chat_history") || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const maskKey = (key: string) => {
  if (!key || key.length <= 8) return key;
  return (
    key.slice(0, 4) + "•".repeat(Math.max(key.length - 8, 0)) + key.slice(-4)
  );
};

const sections = [
  {
    id: "overview",
    label: "Overview",
    icon: Sparkles,
    desc: "System status and knowledge base summary",
  },
  {
    id: "providers",
    label: "Providers",
    icon: Bot,
    desc: "Configure AI models and API keys",
  },
  {
    id: "ingest",
    label: "Ingest",
    icon: Upload,
    desc: "Add documents to your knowledge base",
  },
  {
    id: "tune",
    label: "Tune",
    icon: SlidersHorizontal,
    desc: "Adjust retrieval parameters",
  },
  {
    id: "history",
    label: "History",
    icon: History,
    desc: "View recent conversations",
  },
] as const;

const providerOptions = [
  {
    value: "opensource",
    label: "Ollama",
    desc: "Private & offline",
    icon: SiOllama,
  },
  {
    value: "openai",
    label: "OpenAI",
    desc: "GPT-4 & embeddings",
    icon: SiOpenai,
  },
  {
    value: "gemini",
    label: "Gemini",
    desc: "Flash & embeddings",
    icon: SiGooglegemini,
  },
] as const;

export const ModernSettingsPanel = ({
  children,
  onConfigChange,
  initialSection,
  noSidebar = false,
}: ModernSettingsPanelProps = {}) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<
    (typeof sections)[number]["id"]
  >(initialSection || "overview");
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>([]);
  const [dbStats, setDbStats] = useState({
    total_documents: 0,
    total_chunks: 0,
  });
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource",
  );
  const [url, setUrl] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [ingestionMode, setIngestionMode] = useState<"url" | "manual">("url");
  const [documentScope, setDocumentScope] = useState<"current" | "global">(
    "current",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[]>([]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configRes, statusRes, kbRes, statsRes] = await Promise.all([
        apiGet(API_ENDPOINTS.CONFIG),
        apiGet(API_ENDPOINTS.HEALTH),
        apiGet(API_ENDPOINTS.KNOWLEDGE_BASES),
        apiGet(API_ENDPOINTS.DATABASE_STATS),
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig((prev) => ({ ...prev, ...configData }));
      }
      if (statusRes.ok) setStatus(await statusRes.json());
      if (kbRes.ok)
        setKnowledgeBases((await kbRes.json()).knowledge_bases || []);
      if (statsRes.ok) {
        const data = await statsRes.json();
        setDbStats({
          total_documents: data.total_documents || 0,
          total_chunks: data.total_chunks || 0,
        });
      }
      setHistory(readConversationHistory());
    } catch (error) {
      console.error("Failed to refresh settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchAll();
  }, [fetchAll, open]);

  useEffect(() => {
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("aiProviderChanged", { detail: aiProvider }),
      );
    } catch {
      window.dispatchEvent(new Event("storage"));
    }
  }, [aiProvider]);

  const updateConfig = useCallback((updates: Partial<Config>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const response = await apiPut(API_ENDPOINTS.CONFIG, config);
      if (!response.ok) throw new Error("Failed to save configuration");
      toast({ title: "Saved", description: "Your settings are up to date." });
      onConfigChange?.();
      void fetchAll();
    } catch (error) {
      toast({
        title: "Save failed",
        description:
          error instanceof Error ? error.message : "Unable to save settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [config, fetchAll, isSaving, onConfigChange, toast]);

  const handleIngestion = useCallback(async () => {
    if (isProcessing) return;

    if (ingestionMode === "url" && !url.trim()) {
      toast({
        title: "Add a URL",
        description: "Enter a document URL first.",
        variant: "destructive",
      });
      return;
    }
    if (ingestionMode === "manual" && !manualContent.trim()) {
      toast({
        title: "Add content",
        description: "Paste document content first.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const conversationId =
        documentScope === "current"
          ? localStorage.getItem("current_conversation_id") || "default"
          : "global";
      const endpoint =
        ingestionMode === "url"
          ? API_ENDPOINTS.INGEST
          : API_ENDPOINTS.INGEST + "/manual";
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

      const response = await apiPost(endpoint, payload);
      if (!response.ok)
        throw new Error((await response.text()) || "Ingestion failed");
      const result = await response.json();

      toast({
        title: "Document ingested",
        description: result.chunks_created + " chunks added.",
      });

      setUrl("");
      setManualTitle("");
      setManualContent("");
      void fetchAll();
      onConfigChange?.();
      setActiveSection("overview");
    } catch (error) {
      toast({
        title: "Ingestion failed",
        description: error instanceof Error ? error.message : "Error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    aiProvider,
    documentScope,
    fetchAll,
    ingestionMode,
    isProcessing,
    manualContent,
    manualTitle,
    onConfigChange,
    toast,
    url,
  ]);

  const trigger = useMemo(
    () =>
      children ?? (
        <Button
          variant="ghost"
          size="sm"
          className="h-10 rounded-full px-4 border border-border/40 bg-background/50 shadow-sm hover:bg-muted"
        >
          <Settings2 className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Settings</span>
        </Button>
      ),
    [children],
  );

  const activeSectionObj =
    sections.find((s) => s.id === activeSection) || sections[0];

  const renderSectionContent = () => {
    switch (activeSection) {
      case "overview": {
        const activeProviderOption =
          providerOptions.find((provider) => provider.value === aiProvider) ||
          providerOptions[0];
        const serviceItems = [
          {
            label: "Backend",
            ok: status.backend,
            detail: status.backend
              ? "Connected and serving"
              : "API unavailable",
          },
          {
            label: "LLM",
            ok: status.llm,
            detail: status.llm ? "Model responses ready" : "No model response",
          },
          {
            label: "Vector DB",
            ok: status.vectorDB,
            detail: status.vectorDB ? "Retrieval online" : "Retrieval offline",
          },
        ];
        const healthyCount = serviceItems.filter((item) => item.ok).length;
        const readiness = Math.round(
          (healthyCount / serviceItems.length) * 100,
        );

        return (
          <div className="space-y-6">
            <div className="rounded-3xl border border-border/30 bg-gradient-to-br from-primary/10 via-background/40 to-background/30 p-5 backdrop-blur-2xl shadow-[0_20px_70px_-40px_rgba(0,0,0,0.45)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div>
                    <Badge className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                      <activeProviderOption.icon className="mr-2 h-3.5 w-3.5" />
                      Active
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      Workspace health and readiness
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      A quick view of the services that power your chat flow.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-primary/30 bg-background/50 px-4 py-3 text-right">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    Readiness
                  </div>
                  <div className="mt-1 text-3xl font-bold bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                    {readiness}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {healthyCount} of {serviceItems.length} services online
                  </div>
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-background/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
                  style={{ width: `${readiness}%` }}
                />
              </div>
            </div>

            <div className="space-y-6">
              {!noSidebar && (
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                  <CardDescription>
                    Live health of application services.
                  </CardDescription>
                </CardHeader>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                {serviceItems.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-2xl border p-4 backdrop-blur-xl transition-all",
                      item.ok
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-amber-500/30 bg-amber-500/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {item.label}
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {item.ok ? "Online" : "Offline"}
                        </div>
                      </div>
                      {item.ok ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-6 w-6 text-amber-500" />
                      )}
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      {item.detail}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                {!noSidebar && (
                  <CardHeader>
                    <CardTitle>Knowledge Base</CardTitle>
                    <CardDescription>
                      Vector database statistics and indexed sources.
                    </CardDescription>
                  </CardHeader>
                )}
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-primary/40 p-6 bg-gradient-to-br from-background/60 via-background/40 to-background/50 backdrop-blur-xl hover:border-primary/60 transition-all">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Documents
                      </div>
                      <div className="mt-3 text-4xl font-bold bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                        {dbStats.total_documents}
                      </div>
                    </div>
                    <div className="rounded-xl border border-primary/40 p-6 bg-gradient-to-br from-background/60 via-background/40 to-background/50 backdrop-blur-xl hover:border-primary/60 transition-all">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Chunks
                      </div>
                      <div className="mt-3 text-4xl font-bold bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                        {dbStats.total_chunks}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-3 text-sm font-semibold">
                      Recent Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {knowledgeBases.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          No sources yet.
                        </span>
                      ) : (
                        knowledgeBases.slice(0, 8).map((item) => (
                          <Badge
                            key={item}
                            variant="secondary"
                            className="rounded-xl px-3 py-1.5 font-normal border border-primary/40 bg-gradient-to-br from-background/60 via-background/40 to-background/50 backdrop-blur-xl hover:border-primary/60 transition-all"
                          >
                            <FileText className="mr-2 h-3.5 w-3.5 opacity-70" />
                            {item}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case "providers":
        return (
          <div className="space-y-6">
            <div>
              {!noSidebar && (
                <CardHeader>
                  <CardTitle>AI Provider</CardTitle>
                  <CardDescription>
                    Select the active model for chat and embeddings.
                  </CardDescription>
                </CardHeader>
              )}
              <div className="space-y-4 rounded-3xl border border-border/30 bg-background/35 p-4 backdrop-blur-2xl">
                <RadioGroup
                  value={aiProvider}
                  onValueChange={setAiProvider}
                  className="grid gap-4 sm:grid-cols-3"
                >
                  {providerOptions.map((provider) => (
                    <label
                      key={provider.value}
                      className={cn(
                        "flex flex-col items-start justify-between rounded-xl border-2 p-5 cursor-pointer transition-all backdrop-blur-xl",
                        aiProvider === provider.value
                          ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/20"
                          : "border-border/40 bg-background/40 hover:bg-background/60 hover:border-border/60",
                      )}
                    >
                      <RadioGroupItem
                        value={provider.value}
                        className="sr-only"
                      />
                      <provider.icon
                        className={cn(
                          "mb-3 h-7 w-7",
                          aiProvider === provider.value
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <div className="font-semibold text-sm">
                        {provider.label}
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        {provider.desc}
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-6">
              {!noSidebar && (
                <CardHeader>
                  <CardTitle>Configuration</CardTitle>
                  <CardDescription>
                    Configure the connection for the selected provider.
                  </CardDescription>
                </CardHeader>
              )}
              <div className="space-y-6">
                {aiProvider === "opensource" && (
                  <>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Ollama Base URL
                      </Label>
                      <Input
                        value={config.ollama_base_url}
                        onChange={(e) =>
                          updateConfig({ ollama_base_url: e.target.value })
                        }
                        className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                      />
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Model</Label>
                        <Input
                          value={config.ollama_model}
                          onChange={(e) =>
                            updateConfig({ ollama_model: e.target.value })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">
                          Embedding Model
                        </Label>
                        <Input
                          value={config.embedding_model_name}
                          onChange={(e) =>
                            updateConfig({
                              embedding_model_name: e.target.value,
                            })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                        />
                      </div>
                    </div>
                  </>
                )}
                {aiProvider === "openai" && (
                  <>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">API Key</Label>
                      <div className="relative">
                        <Input
                          type={showOpenAIKey ? "text" : "password"}
                          value={
                            showOpenAIKey
                              ? config.openai_api_key
                              : maskKey(config.openai_api_key)
                          }
                          onChange={(e) =>
                            updateConfig({ openai_api_key: e.target.value })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl pr-12"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-10 w-10 rounded-lg text-muted-foreground hover:bg-background/80"
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
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        API Base URL
                      </Label>
                      <Input
                        value={config.openai_api_base_url}
                        onChange={(e) =>
                          updateConfig({ openai_api_base_url: e.target.value })
                        }
                        className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                      />
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Model</Label>
                        <Input
                          value={config.openai_model}
                          onChange={(e) =>
                            updateConfig({ openai_model: e.target.value })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">
                          Embedding Model
                        </Label>
                        <Input
                          value={config.openai_embedding_model}
                          onChange={(e) =>
                            updateConfig({
                              openai_embedding_model: e.target.value,
                            })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                        />
                      </div>
                    </div>
                  </>
                )}
                {aiProvider === "gemini" && (
                  <>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">API Key</Label>
                      <div className="relative">
                        <Input
                          type={showGeminiKey ? "text" : "password"}
                          value={
                            showGeminiKey
                              ? config.gemini_api_key
                              : maskKey(config.gemini_api_key)
                          }
                          onChange={(e) =>
                            updateConfig({ gemini_api_key: e.target.value })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl pr-12"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-10 w-10 rounded-lg text-muted-foreground hover:bg-background/80"
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
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        API Base URL
                      </Label>
                      <Input
                        value={config.gemini_api_base_url}
                        onChange={(e) =>
                          updateConfig({ gemini_api_base_url: e.target.value })
                        }
                        className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                      />
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Model</Label>
                        <Input
                          value={config.gemini_model}
                          onChange={(e) =>
                            updateConfig({ gemini_model: e.target.value })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">
                          Embedding Model
                        </Label>
                        <Input
                          value={config.gemini_embedding_model}
                          onChange={(e) =>
                            updateConfig({
                              gemini_embedding_model: e.target.value,
                            })
                          }
                          className="h-12 rounded-xl border-border/60 bg-background/60 backdrop-blur-xl"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );

      case "ingest":
        return (
          <div className="space-y-6">
            {!noSidebar && (
              <CardHeader>
                <CardTitle>Ingest Content</CardTitle>
                <CardDescription>
                  Add new documents to your knowledge base to improve chat
                  context.
                </CardDescription>
              </CardHeader>
            )}
            <div className="space-y-8">
              <div className="space-y-4">
                <Label className="text-sm font-semibold">Document Scope</Label>
                <RadioGroup
                  value={documentScope}
                  onValueChange={(v) =>
                    setDocumentScope(v as "current" | "global")
                  }
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label className="flex items-center space-x-3 rounded-2xl border-2 p-4 cursor-pointer bg-background/40 backdrop-blur-xl hover:bg-background/60 transition-all has-[:checked]:border-primary/60 has-[:checked]:bg-primary/10 has-[:checked]:shadow-lg has-[:checked]:shadow-primary/20">
                    <RadioGroupItem value="current" />
                    <div className="space-y-1 flex-1">
                      <div className="text-sm font-semibold leading-none">
                        Current Chat
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Only available in this session
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 rounded-2xl border-2 p-4 cursor-pointer bg-background/40 backdrop-blur-xl hover:bg-background/60 transition-all has-[:checked]:border-primary/60 has-[:checked]:bg-primary/10 has-[:checked]:shadow-lg has-[:checked]:shadow-primary/20">
                    <RadioGroupItem value="global" />
                    <div className="space-y-1 flex-1">
                      <div className="text-sm font-semibold leading-none">
                        Global
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Available across all chats
                      </div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <div className="space-y-4">
                <Label className="text-sm font-semibold">Source Type</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setIngestionMode("url")}
                    className={cn(
                      "flex flex-col items-start gap-3 rounded-2xl border-2 p-5 transition-all text-left backdrop-blur-xl",
                      ingestionMode === "url"
                        ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/20"
                        : "border-border/40 bg-background/40 hover:bg-background/60 hover:border-border/60",
                    )}
                  >
                    <Globe
                      className={cn(
                        "h-6 w-6",
                        ingestionMode === "url"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="font-semibold text-sm">Web URL</div>
                    <div className="text-xs text-muted-foreground">
                      Scrape and ingest a webpage
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIngestionMode("manual")}
                    className={cn(
                      "flex flex-col items-start gap-3 rounded-2xl border-2 p-5 transition-all text-left backdrop-blur-xl",
                      ingestionMode === "manual"
                        ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/20"
                        : "border-border/40 bg-background/40 hover:bg-background/60 hover:border-border/60",
                    )}
                  >
                    <FileText
                      className={cn(
                        "h-6 w-6",
                        ingestionMode === "manual"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="font-semibold text-sm">Raw Text</div>
                    <div className="text-xs text-muted-foreground">
                      Paste text content directly
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                {ingestionMode === "url" ? (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Document URL</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://docs.example.com"
                      className="h-12 rounded-xl border-border/40 bg-background/40 backdrop-blur-xl"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Title (Optional)
                      </Label>
                      <Input
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="Document title"
                        className="h-12 rounded-xl border-border/40 bg-background/40 backdrop-blur-xl"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Content</Label>
                      <Textarea
                        value={manualContent}
                        onChange={(e) => setManualContent(e.target.value)}
                        placeholder="Paste your text here..."
                        className="min-h-[160px] rounded-xl border-border/40 bg-background/40 backdrop-blur-xl resize-y"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="border-t border-border/20 bg-transparent backdrop-blur-xl px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground hidden sm:inline-flex">
                Using {aiProvider} for embeddings
              </span>
              <Button
                onClick={handleIngestion}
                disabled={isProcessing}
                className="w-full sm:w-auto h-11 rounded-xl bg-gradient-to-r from-primary/90 to-fuchsia-500/90 shadow-lg shadow-primary/20"
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}{" "}
                Ingest Document
              </Button>
            </div>
          </div>
        );

      case "tune":
        return (
          <div className="space-y-8">
            {!noSidebar && (
              <CardHeader>
                <CardTitle>Retrieval Tuning</CardTitle>
                <CardDescription>
                  Adjust how text is chunked and retrieved.
                </CardDescription>
              </CardHeader>
            )}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Chunk Size</Label>
                  <span className="text-sm font-bold bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                    {config.chunk_size} tokens
                  </span>
                </div>
                <div className="relative">
                  <Slider
                    value={[config.chunk_size]}
                    min={300}
                    max={2200}
                    step={100}
                    onValueChange={([v]) => updateConfig({ chunk_size: v })}
                    className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-primary/20"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>300</span>
                    <span>2200</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Chunk Overlap</Label>
                  <span className="text-sm font-bold bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                    {config.chunk_overlap} tokens
                  </span>
                </div>
                <div className="relative">
                  <Slider
                    value={[config.chunk_overlap]}
                    min={0}
                    max={600}
                    step={20}
                    onValueChange={([v]) => updateConfig({ chunk_overlap: v })}
                    className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-primary/20"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>0</span>
                    <span>600</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Top K Results</Label>
                  <span className="text-sm font-bold bg-gradient-to-br from-primary to-fuchsia-500 bg-clip-text text-transparent">
                    {config.top_k_results}
                  </span>
                </div>
                <div className="relative">
                  <Slider
                    value={[config.top_k_results]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([v]) => updateConfig({ top_k_results: v })}
                    className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-primary/20"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4 pt-4 border-t border-border/20">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">System Prompt</Label>
                <p className="text-xs text-muted-foreground">
                  The core instruction given to the AI model before every chat.
                </p>
              </div>
              <Textarea
                value={config.system_prompt}
                onChange={(e) =>
                  updateConfig({ system_prompt: e.target.value })
                }
                className="min-h-[120px] rounded-xl border-border/40 bg-background/40 backdrop-blur-xl text-sm"
              />
            </div>
          </div>
        );

      case "history":
        return (
          <div>
            {!noSidebar && (
              <CardHeader>
                <CardTitle>Chat History</CardTitle>
                <CardDescription>Recent local conversations.</CardDescription>
              </CardHeader>
            )}
            <div>
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="h-10 w-10 text-muted-foreground/50 mb-4" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No conversations yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-4 bg-card hover:bg-accent/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="truncate text-sm font-medium leading-none mb-1.5">
                          {item.preview || "Empty conversation"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="flex-none font-normal"
                      >
                        Chat
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  const SettingsLayout = () => (
    <div
      className={cn(
        "flex w-full min-h-0 overflow-hidden",
        isMobile ? "flex-col h-full" : "h-[85vh] flex-row",
      )}
    >
      {isMobile ? (
        <div className="flex-none">
          <ScrollArea className="w-full">
            <div className="flex w-max space-x-2 px-4 pb-4">
              {sections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all backdrop-blur-xl border",
                      active
                        ? "bg-primary/6 text-primary border-primary/60 shadow-lg shadow-primary/12"
                        : "bg-background/40 text-muted-foreground border-primary/40 hover:bg-background/60 hover:text-foreground hover:border-primary/60",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>
      ) : (
        <aside className="w-[260px] flex-none flex flex-col p-4">
          {/* Floating sidebar container */}
          <div className="relative flex h-full flex-col">
            {/* Subtle tonal background (reduced intensity for cleaner look) */}
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/8 via-primary/6 to-transparent opacity-40 blur-lg" />
            </div>
            <div className="h-full flex flex-col rounded-3xl border border-border/20 bg-background/16 backdrop-blur-3xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <Logo size={32} />
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      Cogent-x
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Control Center
                    </p>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-1">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const active = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all border",
                          active
                            ? "bg-primary/10 text-primary shadow-lg shadow-primary/20 border-primary/60"
                            : "text-muted-foreground hover:bg-background/60 hover:text-foreground border-primary/40 hover:border-primary/60",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="p-4 border-t border-border/20 bg-transparent backdrop-blur-3xl grid gap-2">
                <Button
                  variant="outline"
                  onClick={fetchAll}
                  disabled={isLoading}
                  className="w-full justify-start h-9 px-3 rounded-xl border border-primary/40 bg-transparent hover:bg-background/8 hover:border-primary/60"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" />
                  )}{" "}
                  Refresh Status
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full justify-start h-9 px-3 rounded-xl border border-border/20 bg-transparent text-primary hover:bg-background/8"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4 text-primary-foreground/80" />
                  )}{" "}
                  Save Configuration
                </Button>
              </div>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex min-h-0 flex-col min-w-0 relative">
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 left-[-10rem] h-96 w-96 rounded-full bg-gradient-to-br from-primary/15 via-primary/8 to-transparent blur-3xl animate-drift" />
          <div className="absolute top-16 right-[-9rem] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-fuchsia-500/12 via-fuchsia-500/6 to-transparent blur-3xl animate-blob animation-delay-2000" />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div
            className={cn(
              "mx-auto max-w-5xl space-y-6 pb-24 md:pb-8",
              isMobile ? "p-4" : "p-6",
            )}
          >
            {renderSectionContent()}
          </div>
        </ScrollArea>
        {isMobile && (
          <div className="flex-none border-t border-border/40 bg-gradient-to-b from-background/70 via-background/45 to-background/70 backdrop-blur-2xl p-4 flex gap-3 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
            <Button
              variant="outline"
              onClick={fetchAll}
              disabled={isLoading}
              className="flex-1 h-11"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-11"
            >
              <Save className="mr-2 h-4 w-4" /> Save All
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[94vh] border border-primary/20 bg-gradient-to-b from-background/95 via-background/90 to-background/95 p-0 shadow-2xl overflow-hidden rounded-t-[2rem]">
          <div className="flex h-[94vh] flex-col overflow-hidden px-3 pb-3 pt-3">
            {noSidebar ? (
              <div className="flex h-full flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                  <div className="px-4 py-4">{renderSectionContent()}</div>
                </ScrollArea>
                <div className="flex gap-2 border-t border-border/40 bg-background/60 p-3 backdrop-blur-xl">
                  <Button
                    variant="outline"
                    onClick={fetchAll}
                    disabled={isLoading}
                    className="h-11 flex-1 rounded-xl border-primary/40 bg-background/40 hover:border-primary/60 hover:bg-background/70"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-11 flex-1 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <SettingsLayout />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {noSidebar ? (
        <DialogContent className="max-w-[900px] w-[92vw] max-h-[calc(100vh-2rem)] p-0 gap-0 overflow-hidden bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-2xl border border-primary/30 sm:rounded-xl shadow-2xl before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent before:pointer-events-none">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Manage your Cogent-x settings
          </DialogDescription>
          <div className="p-6">
            <ScrollArea className="h-[70vh]">
              <div className="p-4">{renderSectionContent()}</div>
            </ScrollArea>
            <div className="pt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : (
        <DialogContent className="max-w-[1400px] w-[92vw] max-h-[calc(100vh-2rem)] p-0 gap-0 overflow-hidden bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-2xl border border-primary/30 sm:rounded-xl shadow-2xl before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent before:pointer-events-none">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Manage your Cogent-x settings
          </DialogDescription>
          <SettingsLayout />
        </DialogContent>
      )}
    </Dialog>
  );
};

export default ModernSettingsPanel;
