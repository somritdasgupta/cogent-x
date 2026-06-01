import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Database, FileText, Loader2, Search } from "lucide-react";
import { API_ENDPOINTS, apiGet } from "@/config/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
  const isMobile = useIsMobile();
  const [chunks, setChunks] = useState<SourceChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyUsed, setShowOnlyUsed] = useState(false);

  const filteredChunks = useMemo(() => {
    return chunks.filter((chunk) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        chunk.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUsedFilter =
        !showOnlyUsed || usedChunks.includes(chunk.index);
      return matchesSearch && matchesUsedFilter;
    });
  }, [chunks, searchQuery, showOnlyUsed, usedChunks]);

  const loadChunks = useCallback(async (sourceUrl: string) => {
    setIsLoading(true);
    setChunks([]);
    try {
      const endpoint = `${API_ENDPOINTS.DATABASE_SOURCE_CHUNKS}?url=${encodeURIComponent(sourceUrl)}`;
      const response = await apiGet(endpoint);
      if (!response.ok) throw new Error("Failed to load chunks");
      const result = await response.json();
      setChunks(result.chunks || []);
    } catch {
      setChunks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (url) {
      void loadChunks(url);
    } else {
      setChunks([]);
      setSearchQuery("");
      setShowOnlyUsed(false);
    }
  }, [url, loadChunks]);

  const usedCount = useMemo(() => {
    if (!usedChunks.length || !chunks.length) return 0;
    return chunks.filter((chunk) => usedChunks.includes(chunk.index)).length;
  }, [chunks, usedChunks]);

  const sourceHost = useMemo(() => {
    if (!url) return "Unknown source";
    try {
      return new URL(url).hostname;
    } catch {
      return "Custom source";
    }
  }, [url]);

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search chunks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full border border-border/40 bg-background/70"
            >
              <Database className="mr-1.5 h-3 w-3" />
              {chunks.length} total
            </Badge>
            {usedChunks.length > 0 && (
              <Badge
                variant="secondary"
                className="rounded-full border border-primary/30 bg-primary/10 text-primary"
              >
                <FileText className="mr-1.5 h-3 w-3" />
                {usedCount} used
              </Badge>
            )}
          </div>
          {usedChunks.length > 0 && (
            <div className="flex items-center gap-2">
              <Label
                htmlFor="show-used"
                className="text-xs text-muted-foreground"
              >
                Used only
              </Label>
              <Switch
                id="show-used"
                checked={showOnlyUsed}
                onCheckedChange={setShowOnlyUsed}
              />
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-3 pb-1">
            {filteredChunks.map((chunk, idx) => {
              const isUsed = usedChunks.includes(chunk.index);
              return (
                <Card
                  key={`${chunk.index}-${idx}`}
                  className={cn(
                    "rounded-2xl border border-border/40 bg-card/90 backdrop-blur-xl",
                    isUsed ? "border-primary/50 bg-primary/5" : "",
                  )}
                >
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Badge variant={isUsed ? "default" : "outline"}>
                          Chunk {idx + 1}
                        </Badge>
                        {isUsed && <Badge variant="secondary">Used</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Index: {chunk.index}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground/90">
                      {chunk.content}
                    </p>
                    {chunk.metadata &&
                      Object.keys(chunk.metadata).length > 0 && (
                        <>
                          <Separator />
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(chunk.metadata).map(
                              ([key, value]) => (
                                <Badge
                                  key={key}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {key}: {value}
                                </Badge>
                              ),
                            )}
                          </div>
                        </>
                      )}
                  </CardContent>
                </Card>
              );
            })}

            {filteredChunks.length === 0 && !isLoading && (
              <Card>
                <CardContent className="pt-4 text-center text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? "No chunks match your search."
                    : "No chunks found."}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={url !== null} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[94vh] border border-primary/20 bg-gradient-to-b from-background/95 via-background/90 to-background/95 p-0 shadow-2xl overflow-hidden rounded-t-[2rem]">
          <div className="flex h-[94vh] min-h-0 flex-col overflow-hidden px-3 pb-3 pt-3">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-primary/20 bg-card/80">
              <div className="border-b border-border/20 px-5 py-4">
                <DrawerDescription className="mt-1 break-all italic text-left text-sm text-muted-foreground">
                  {url}
                </DrawerDescription>
              </div>

              {content}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={url !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col max-w-[900px] w-[92vw] max-h-[calc(100vh-2rem)] p-0 gap-0 overflow-hidden bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-2xl border border-primary/30 sm:rounded-xl shadow-2xl before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent before:pointer-events-none">
        <div className="flex items-start justify-between gap-4 border-b border-border/20 px-5 py-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogDescription className="break-all italic text-sm text-muted-foreground">
              {url}
            </DialogDescription>
          </DialogHeader>
        </div>

        {content}
      </DialogContent>
    </Dialog>
  );
};
