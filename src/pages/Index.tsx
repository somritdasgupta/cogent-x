import QueryInterface from "@/components/QueryInterface";
import { UnifiedSettingsPanel } from "@/components/UnifiedSettingsPanel";
import { Github, BookOpen, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiDocsUrl } from "@/config/api";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ai-gradient flex items-center justify-center overflow-hidden shadow-sm">
                <img
                  src="/favicon.ico"
                  alt="cogent-x"
                  className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-black text-foreground">
                  cogent-x
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs px-2 h-8"
                onClick={() =>
                  window.open(
                    "https://stats.uptimerobot.com/FxzeOvqyqU",
                    "_blank"
                  )
                }
                title="View System Status"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="hidden sm:inline font-medium">Status</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(getApiDocsUrl(), "_blank")}
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">API Docs</span>
              </Button>
              <UnifiedSettingsPanel />
            </div>
          </div>
        </div>
      </header>

      {/* Full-screen chat interface */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <QueryInterface />
      </main>

      {/* Footer - Fixed at bottom */}
      <footer className="fixed bottom-0 left-0 right-0 border-t py-2 bg-slate-900 dark:bg-slate-950 backdrop-blur border-slate-700 z-50">
        <div className="container mx-auto px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-between gap-2 text-xs text-blue-300">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="font-medium hidden sm:inline">
                Developed by Somrit Dasgupta
              </span>
              <span className="font-medium sm:hidden">Somrit Dasgupta</span>
              <a
                href="https://github.com/somritdasgupta"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 sm:gap-1.5 hover:text-blue-200 transition-colors"
              >
                <Github className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">@somritdasgupta</span>
              </a>
            </div>
            <a
              href="https://github.com/somritdasgupta/cogent-x"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-200 transition-colors font-medium"
            >
              <Code className="h-3.5 w-3.5" />
              <span className="sm:hidden">Code</span>
              <span className="hidden sm:inline">View Source Code</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
