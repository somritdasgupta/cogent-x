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

  const handleIngestion = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) {
        toast({
          title: "Error",
          description: "Please enter a valid URL",
          variant: "destructive",
        });
        return;
      }
      if (isProcessing) return; // Prevent double submissions

      setIsProcessing(true);
      try {
        const response = await apiPost(API_ENDPOINTS.INGEST, {
          url: url.trim(),
        });
        if (!response.ok) throw new Error("Ingestion failed");
        const data = await response.json();
        toast({
          title: "Success",
          description: data.message || "Document ingested successfully",
          className: "border-green-500/50 bg-green-50 dark:bg-green-950/30",
        });
        setUrl("");
        await fetchKnowledgeBases();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to ingest document",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [url, isProcessing, toast, fetchKnowledgeBases],
  );

  return (
    <Card className="app-panel w-full">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <CardTitle className="text-base font-semibold sm:text-lg">
          Knowledge Base
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        <form onSubmit={handleIngestion} className="space-y-3">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter documentation URL to ingest"
            disabled={isProcessing}
            className="h-11 rounded-xl border-border/70 bg-background/80 px-4 text-sm shadow-sm"
          />

          <Button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-primary to-fuchsia-500 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95"
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
