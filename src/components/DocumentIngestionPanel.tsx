import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Loader2, FileText } from "lucide-react";
import { buildApiUrl, API_ENDPOINTS, apiGet, apiPost } from "@/config/api";

export const DocumentIngestionPanel = () => {
  const [url, setUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>([]);
  const [isLoadingKB, setIsLoadingKB] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchKnowledgeBases();
  }, []);

  const fetchKnowledgeBases = async () => {
    try {
      setIsLoadingKB(true);
      const response = await apiGet(API_ENDPOINTS.KNOWLEDGE_BASES);
      if (response.ok) {
        const data = await response.json();
        console.log(
          "[DocumentIngestion] Knowledge bases received:",
          data.knowledge_bases
        );
        setKnowledgeBases(data.knowledge_bases || []);
      } else {
        console.error(
          "[DocumentIngestion] Failed to fetch knowledge bases:",
          response.status
        );
      }
    } catch (error) {
      console.error(
        "[DocumentIngestion] Failed to fetch knowledge bases:",
        error
      );
    } finally {
      setIsLoadingKB(false);
    }
  };

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
      const response = await apiPost(API_ENDPOINTS.INGEST, { url: url.trim() });

      if (!response.ok) {
        throw new Error("Ingestion failed");
      }

      const data = await response.json();
      console.log("[DocumentIngestion] Ingestion response:", data);

      toast({
        title: "Success",
        description: data.message || "Document ingested successfully",
      });

      setUrl("");
      console.log("[DocumentIngestion] Refreshing knowledge bases...");
      fetchKnowledgeBases(); // Refresh knowledge bases
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to ingest document",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Knowledge Base</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        <form onSubmit={handleIngestion} className="space-y-3">
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

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Available Sources</h4>
            {isLoadingKB && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {!isLoadingKB && knowledgeBases.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No knowledge bases ingested yet. Add a URL above to get started.
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
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">
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
