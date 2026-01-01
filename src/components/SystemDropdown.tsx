import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CheckCircle, AlertCircle, Upload, Loader2, FileText, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiGet, apiPost } from "@/config/api";

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

export const SystemDropdown = () => {
  const [url, setUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>([]);
  const [isLoadingKB, setIsLoadingKB] = useState(true);
  const [status, setStatus] = useState<SystemStatus>({ backend: false, llm: false, vectorDB: false });
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("aiProvider") || "opensource");
  const { toast } = useToast();

  useEffect(() => { localStorage.setItem("aiProvider", aiProvider); }, [aiProvider]);

  useEffect(() => {
    fetchKnowledgeBases();
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.HEALTH);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      setStatus({ backend: false, llm: false, vectorDB: false });
    }
  };

  const fetchKnowledgeBases = async () => {
    try {
      setIsLoadingKB(true);
      const response = await apiGet(API_ENDPOINTS.KNOWLEDGE_BASES);
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBases(data.knowledge_bases || []);
      }
    } catch (error) {
      setKnowledgeBases([]);
    } finally {
      setIsLoadingKB(false);
    }
  };

  const handleIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast({ title: "Error", description: "Please enter a valid URL", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const response = await apiPost(API_ENDPOINTS.INGEST, { url: url.trim() });
      if (!response.ok) throw new Error("Ingestion failed");
      const data = await response.json();
      toast({ title: "Success", description: data.message || "Document ingested successfully" });
      setUrl("");
      fetchKnowledgeBases();
    } catch (error) {
      toast({ title: "Error", description: "Failed to ingest document", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const isSystemReady = status.backend && status.llm && status.vectorDB;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">System</span>
          {isSystemReady ? (
            <Badge
              variant="outline"
              className="bg-success/10 text-success border-success/20 h-5 px-1.5"
            >
              <CheckCircle className="h-3 w-3" />
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-destructive/10 text-destructive border-destructive/20 h-5 px-1.5"
            >
              <AlertCircle className="h-3 w-3" />
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>System Settings</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* System Status Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">System Status</h3>
              {isSystemReady ? (
                <Badge
                  variant="outline"
                  className="bg-success/10 text-success border-success/20"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Ready
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/20"
                >
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not Ready
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                <span className="font-medium">Backend API</span>
                {status.backend ? (
                  <Badge
                    variant="outline"
                    className="bg-success/10 text-success border-success/20"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Online
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-destructive/10 text-destructive border-destructive/20"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Offline
                  </Badge>
                )}
              </div>
              <div className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                <span className="font-medium">LLM Service</span>
                {status.llm ? (
                  <Badge
                    variant="outline"
                    className="bg-success/10 text-success border-success/20"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Online
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-destructive/10 text-destructive border-destructive/20"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Offline
                  </Badge>
                )}
              </div>
              <div className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                <span className="font-medium">Vector DB</span>
                {status.vectorDB ? (
                  <Badge
                    variant="outline"
                    className="bg-success/10 text-success border-success/20"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Online
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-destructive/10 text-destructive border-destructive/20"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Offline
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* AI Provider Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">AI Provider</label>
            <Select value={aiProvider} onValueChange={setAiProvider}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opensource">Open Source LLM</SelectItem>
                <SelectItem value="openai">OpenAI GPT</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {aiProvider === "openai"
                ? "Using OpenAI GPT models"
                : aiProvider === "gemini"
                ? "Using Google Gemini models"
                : "Using local Ollama models"}
            </p>
          </div>

          <Separator />

          {/* Knowledge Base Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Knowledge Base</h3>

            <form onSubmit={handleIngestion} className="space-y-2">
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter documentation URL to ingest"
                disabled={isProcessing}
                className="text-sm"
              />

              <Button
                type="submit"
                className="w-full text-sm"
                disabled={isProcessing || !url.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    Ingest Document
                  </>
                )}
              </Button>
            </form>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground">
                  Available Sources
                </h4>
                {isLoadingKB && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {!isLoadingKB && knowledgeBases.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No knowledge bases ingested yet. Add a URL above to get
                  started.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {knowledgeBases.map((kb, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="text-xs flex items-center gap-1.5 px-2 py-1"
                    >
                      <FileText className="h-3 w-3" />
                      <span className="truncate max-w-[150px]">{kb}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
