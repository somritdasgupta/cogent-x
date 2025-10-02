import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertCircle } from "lucide-react";
import { buildApiUrl, API_ENDPOINTS, apiGet } from "@/config/api";

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

export const SystemStatusPanel = () => {
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false,
  });

  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource"
  );

  useEffect(() => {
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.HEALTH);
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.error("Health check failed:", error);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isSystemReady = status.backend && status.llm && status.vectorDB;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg">System Status</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 px-4 sm:px-6">
        <div className="flex items-center justify-center">
          {isSystemReady ? (
            <Badge className="bg-success text-success-foreground">
              <CheckCircle className="mr-1 h-3 w-3" />
              Ready
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
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

        <Separator />

        <div className="space-y-2">
          <label className="text-sm font-medium">AI Provider</label>
          <Select value={aiProvider} onValueChange={setAiProvider}>
            <SelectTrigger className="w-full h-9 text-sm">
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
      </CardContent>
    </Card>
  );
};
