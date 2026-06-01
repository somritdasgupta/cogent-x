import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Loader2, FileText } from "lucide-react";
import { API_ENDPOINTS, apiGet, apiPost } from "@/config/api";

export const DocumentIngestionPanel = () => {
  const [url, setUrl] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>([]);
  const [isLoadingKB, setIsLoadingKB] = useState(true);
  const { toast } = useToast();

  const fetchKnowledgeBases = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchKnowledgeBases();
  }, [fetchKnowledgeBases]);

  const handleAddUrl = useCallback(() => {
    if (!url.trim()) return;
    if (urls.includes(url.trim())) {
      toast({
        title: "Already added",
        description: "This URL is already in the queue.",
        variant: "destructive",
      });
      return;
    }
    setUrls([...urls, url.trim()]);
    setUrl("");
  }, [url, urls, toast]);

  const handleRemoveUrl = useCallback(
    (urlToRemove: string) => {
      setUrls(urls.filter((u) => u !== urlToRemove));
    },
    [urls],
  );

  const handleIngestion = useCallback(async () => {
    if (urls.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one URL",
        variant: "destructive",
      });
      return;
    }
    if (isProcessing) return;

    setIsProcessing(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const ingestUrl of urls) {
        try {
          const response = await apiPost(API_ENDPOINTS.INGEST, {
            url: ingestUrl,
          });
          if (!response.ok) {
            failCount++;
          } else {
            successCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Documents ingested",
          description: `${successCount} document${successCount !== 1 ? "s" : ""} added successfully.`,
        });
      }
      if (failCount > 0) {
        toast({
          title: "Partial failure",
          description: `${failCount} document${failCount !== 1 ? "s" : ""} failed to ingest.`,
          variant: "destructive",
        });
      }
      setUrls([]);
      await fetchKnowledgeBases();
    } finally {
      setIsProcessing(false);
    }
  }, [urls, isProcessing, toast, fetchKnowledgeBases]);

  return (
    <Card className="app-panel w-full">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <CardTitle className="text-base font-semibold sm:text-lg">
          Knowledge Base
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
              placeholder="Enter documentation URL..."
              disabled={isProcessing}
              className="h-10 rounded-lg border-border/70 bg-background/80 px-3 text-sm shadow-sm flex-1"
            />
            <Button
              onClick={handleAddUrl}
              disabled={!url.trim() || isProcessing}
              className="h-10 rounded-lg bg-primary/80 text-white hover:bg-primary text-sm font-medium"
            >
              Add
            </Button>
          </div>

          {urls.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border/30 bg-background/40 p-3">
              <p className="text-xs font-medium text-foreground/70">
                Queue ({urls.length})
              </p>
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                {urls.map((u) => (
                  <div
                    key={u}
                    className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-xs group"
                  >
                    <span className="truncate text-foreground/75">{u}</span>
                    <button
                      onClick={() => handleRemoveUrl(u)}
                      className="h-5 w-5 rounded-sm flex items-center justify-center text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors shrink-0"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleIngestion}
            className="w-full rounded-lg bg-gradient-to-r from-primary to-fuchsia-500 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 h-10"
            disabled={isProcessing || urls.length === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-3.5 w-3.5" />
                Ingest All Documents
              </>
            )}
          </Button>
        </div>

        <Separator className="bg-border/70" />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground/90">
              Available Sources
            </h4>
            {isLoadingKB && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {!isLoadingKB && knowledgeBases.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No knowledge bases ingested yet. Add a URL above to get started.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {knowledgeBases.map((kb, index) => (
                <Badge
                  key={`${kb}-${index}`}
                  variant="secondary"
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-xs text-foreground"
                >
                  <FileText className="h-3 w-3 flex-shrink-0" />
                  <span
                    className="max-w-[150px] truncate sm:max-w-[250px]"
                    title={kb}
                  >
                    {kb}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
