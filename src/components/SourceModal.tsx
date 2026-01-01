import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Search } from "lucide-react";
import { API_ENDPOINTS, apiGet } from "@/config/api";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyUsed, setShowOnlyUsed] = useState(false);

  const filteredChunks = chunks.filter((chunk) => {
    const matchesSearch = searchQuery.trim() === "" || chunk.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUsedFilter = !showOnlyUsed || usedChunks.includes(chunk.index);
    return matchesSearch && matchesUsedFilter;
  });

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
  };

  return (
    <Dialog open={url !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Source Chunks</DialogTitle>
          <DialogDescription className="break-all">{url}</DialogDescription>
        </DialogHeader>

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

          {usedChunks.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <Label htmlFor="show-used" className="text-sm">Show only used chunks</Label>
                <Switch id="show-used" checked={showOnlyUsed} onCheckedChange={setShowOnlyUsed} />
              </div>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 mt-4">
            {filteredChunks.map((chunk, idx) => {
              const isUsed = usedChunks.includes(chunk.index);
              return (
                <Card key={idx} className={isUsed ? "border-primary" : ""}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Badge variant={isUsed ? "default" : "outline"}>Chunk {idx + 1}</Badge>
                        {isUsed && <Badge variant="secondary">Used</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">Index: {chunk.index}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{chunk.content}</p>
                    {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                      <>
                        <Separator />
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(chunk.metadata).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
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
                  {searchQuery.trim() ? "No chunks match your search." : "No chunks found."}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
