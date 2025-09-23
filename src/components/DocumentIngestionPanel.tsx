import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2 } from "lucide-react";

export const DocumentIngestionPanel = () => {
  const [url, setUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/v1/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!response.ok) {
        throw new Error('Ingestion failed');
      }

      toast({
        title: "Success",
        description: "Document ingested successfully",
      });

      setUrl("");
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to ingest document",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg">Document Ingestion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleIngestion} className="space-y-3">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter document URL"
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
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-3 w-3" />
                Ingest Document
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};