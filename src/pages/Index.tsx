// Update this page (the content is just a fallback if you fail to update the page)

import { DocumentIngestionPanel } from "@/components/DocumentIngestionPanel";
import { QueryInterface } from "@/components/QueryInterface";
import { SystemStatusPanel } from "@/components/SystemStatusPanel";
import { Brain, Github } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-6 sm:py-8">
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-ai-gradient flex items-center justify-center">
              <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Cogent
            </h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            Private RAG system for intelligent document querying
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <DocumentIngestionPanel />
            <QueryInterface />
          </div>
          
          <div className="space-y-6">
            <SystemStatusPanel />
          </div>
        </div>
      </main>

      <footer className="border-t py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Developed by Somrit Dasgupta</span>
              <a 
                href="https://github.com/somritdasgupta" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Github className="h-3 w-3" />
                @somritdasgupta
              </a>
            </div>
            <a 
              href="https://github.com/somritdasgupta/cogent" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              Source Code
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
