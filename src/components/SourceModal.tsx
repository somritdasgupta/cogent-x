import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Search,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { API_ENDPOINTS, buildApiUrlWithParams, apiGet } from "@/config/api";

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

  // Filter chunks based on search and toggle
  const filteredChunks = chunks.filter((chunk) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      chunk.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUsedFilter = !showOnlyUsed || usedChunks.includes(chunk.index);
    return matchesSearch && matchesUsedFilter;
  });

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
      const endpoint = `${
        API_ENDPOINTS.DATABASE_SOURCE_CHUNKS
      }?url=${encodeURIComponent(sourceUrl)}`;
      const response = await apiGet(endpoint);

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
    <Sheet open={url !== null} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>Source Chunks</span>
              {url && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(url, "_blank")}
                  className="h-7 px-2 hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs break-all pt-1">
            {url}
          </SheetDescription>
          {usedChunks.length > 0 && (
            <Alert className="mt-3 border-primary/20 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <span className="font-semibold text-primary">
                  {usedChunks.length}
                </span>{" "}
                chunk
                {usedChunks.length !== 1 ? "s were" : " was"} used to generate
                the answer. Highlighted chunks below show the exact content
                used.
              </AlertDescription>
            </Alert>
          )}
        </SheetHeader>

        {/* Search Bar and Filters */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search in chunks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {usedChunks.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                <Label
                  htmlFor="show-used-only"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  Show only used chunks
                </Label>
                <Switch
                  id="show-used-only"
                  checked={showOnlyUsed}
                  onCheckedChange={setShowOnlyUsed}
                />
              </div>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredChunks.map((chunk, idx) => {
              const isUsed = usedChunks.includes(chunk.index);
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg space-y-3 transition-all duration-200 ${
                    isUsed
                      ? "bg-primary/10 border-2 border-primary shadow-lg ring-2 ring-primary/20"
                      : "bg-muted/50 border border-border/50 hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isUsed ? "default" : "outline"}
                        className={isUsed ? "bg-primary shadow-sm" : ""}
                      >
                        Chunk {idx + 1}
                        {isUsed && " ✓"}
                      </Badge>
                      {isUsed && (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-primary/20 text-primary border-primary/30"
                        >
                          Used in answer
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      Index: {chunk.index}
                    </span>
                  </div>
                  <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {chunk.content}
                  </div>
                  {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                    <div className="pt-3 border-t border-border/50">
                      <div className="text-xs text-muted-foreground font-semibold mb-2">
                        Metadata:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(chunk.metadata).map(([key, value]) => (
                          <Badge
                            key={key}
                            variant="secondary"
                            className="text-xs font-normal"
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

            {filteredChunks.length === 0 && !isLoading && (
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
                  {searchQuery.trim()
                    ? "No chunks match your search."
                    : "No chunks found for this source."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
