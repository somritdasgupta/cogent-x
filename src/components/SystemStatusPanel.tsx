import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, AlertCircle } from "lucide-react";

interface SystemStatus {
  backend: boolean;
  llm: boolean;
  vectorDB: boolean;
}

export const SystemStatusPanel = () => {
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    llm: false,
    vectorDB: false
  });
  
  const [aiProvider, setAiProvider] = useState(() => 
    localStorage.getItem('aiProvider') || 'opensource'
  );

  useEffect(() => {
    localStorage.setItem('aiProvider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/v1/health');
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isSystemReady = status.backend && status.llm && status.vectorDB;

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg">System Status</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
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

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span>Backend API</span>
            {status.backend ? 
              <CheckCircle className="h-3 w-3 text-success" /> : 
              <AlertCircle className="h-3 w-3 text-destructive" />
            }
          </div>
          <div className="flex justify-between">
            <span>LLM Service</span>
            {status.llm ? 
              <CheckCircle className="h-3 w-3 text-success" /> : 
              <AlertCircle className="h-3 w-3 text-destructive" />
            }
          </div>
          <div className="flex justify-between">
            <span>Vector DB</span>
            {status.vectorDB ? 
              <CheckCircle className="h-3 w-3 text-success" /> : 
              <AlertCircle className="h-3 w-3 text-destructive" />
            }
          </div>
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-sm font-medium">AI Provider</span>
            <p className="text-xs text-muted-foreground">
              {aiProvider === 'openai' ? 'OpenAI GPT' : aiProvider === 'gemini' ? 'Google Gemini' : 'Open Source LLM'}
            </p>
          </div>
          <Select value={aiProvider} onValueChange={setAiProvider}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opensource">Open Source</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};