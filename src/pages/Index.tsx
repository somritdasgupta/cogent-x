import QueryInterface from "@/components/QueryInterface";
import { UnifiedSettingsPanel } from "@/components/UnifiedSettingsPanel";
import { Github, BookOpen, Code, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiDocsUrl } from "@/config/api";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b py-3 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <img
                src="/favicon.svg"
                alt="cogent-x logo"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg shadow-md"
              />
              <div>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white">
                  cogent-x
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-all duration-200"
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
