import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { API_ENDPOINTS, buildApiUrlWithParams } from "@/config/api";

interface SourceChunk {
  content: string;
  metadata: Record<string, string>;
  index: number;
}

interface SourceModalProps {
  url: string | null;
  usedChunks: number[];
  onClose: () => void;
}

export const SourceModal = ({ url, usedChunks, onClose }: SourceModalProps) => {
  const [chunks, setChunks] = useState<SourceChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load chunks when dialog opens
  useEffect(() => {
    if (url) {
      loadChunks(url);
    } else {
      setChunks([]);
    }
  }, [url]);

  const loadChunks = async (sourceUrl: string) => {
    setIsLoading(true);
    setChunks([]);

    try {
      const response = await fetch(
        buildApiUrlWithParams(API_ENDPOINTS.DATABASE_SOURCE_CHUNKS, {
          url: sourceUrl,
        })
      );

      if (!response.ok) {
        throw new Error("Failed to load chunks");
      }

      const result = await response.json();
      setChunks(result.chunks || []);
    } catch (error) {
      console.error("Error loading chunks:", error);
      setChunks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setChunks([]);
      onClose();
    }
  };

  return (
    <Dialog open={url !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Source Chunks</span>
            {url && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(url, "_blank")}
                className="h-6 px-2"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs break-all">
            {url}
          </DialogDescription>
          {usedChunks.length > 0 && (
            <Alert className="mt-2">
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                <span className="font-semibold">{usedChunks.length}</span> chunk
                {usedChunks.length !== 1 ? "s were" : " was"} used to generate
                the answer. Highlighted chunks below show the exact content
                used.
              </AlertDescription>
            </Alert>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {chunks.map((chunk, idx) => {
              const isUsed = usedChunks.includes(chunk.index);
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg space-y-2 transition-all duration-200 ${
                    isUsed
                      ? "bg-primary/10 border-2 border-primary shadow-md ring-2 ring-primary/20"
                      : "bg-muted/50 border border-border opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={isUsed ? "default" : "outline"}>
                        Chunk {idx + 1}
                        {isUsed && " ✓"}
                      </Badge>
                      {isUsed && (
                        <Badge variant="secondary" className="text-xs">
                          Used in answer
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Index: {chunk.index}
                    </span>
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">
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
              );
            })}

            {chunks.length === 0 && !isLoading && (
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
  );
};
