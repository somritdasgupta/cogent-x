import { useState, useEffect, useRef, FormEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SourceModal } from "@/components/SourceModal";
import {
  Loader2,
  Send,
  MessageSquare,
  ExternalLink,
  Sparkles,
  BookOpen,
  Lightbulb,
  CheckCircle2,
  Mic,
  Volume2,
  VolumeX,
  Copy,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  API_ENDPOINTS,
  buildApiUrl,
  apiPost,
  apiRequest,
  processApiResponse,
} from "@/config/api";
import { useToast } from "@/hooks/use-toast";

interface SourceInfo {
  url: string;
  used_chunks: { index: number; content: string }[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SourceInfo[];
}

interface ProcessingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "complete";
  icon: React.ReactNode;
}

const QueryInterface = () => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuery, setCurrentQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource"
  );
  const [viewingSource, setViewingSource] = useState<{
    url: string;
    usedChunks: number[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const buttonModeRef = useRef<"send" | "mic">("send");
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Listen for provider changes from localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      setAiProvider(localStorage.getItem("aiProvider") || "opensource");
    };

    window.addEventListener("storage", handleStorageChange);
    // Also check periodically in case of same-window updates
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.removeAttribute("src");
          currentAudioRef.current.load();
          currentAudioRef.current = null;
        } catch (e) {
          console.log("Error cleaning up audio:", e);
        }
      }
    };
  }, []);

  const quickPrompts = [
    "How do I get started?",
    "Show me a code example",
    "What are the installation steps?",
    "Explain the architecture",
    "List all API endpoints",
    "What are the configuration options?",
    "Show me best practices",
    "Troubleshooting common errors",
    "How to deploy to production?",
    "What are the dependencies?",
    "Show me the database schema",
    "How to join multiple tables?",
    "Write a SQL query for...",
    "Explain the table relationships",
    "What are the foreign keys?",
    "Show me database migrations",
  ];

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      // Visual indicator shows recording state
    } catch (error) {
      console.error("Microphone error:", error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      const response = await apiRequest(API_ENDPOINTS.TRANSCRIBE, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || "Transcription failed";
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.text) {
        setCurrentQuery(data.text);
        toast({
          title: "Transcription complete!",
          description: "Your speech has been converted to text",
        });
      } else {
        throw new Error("No text returned from transcription");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Transcription failed";

      toast({
        title: "Transcription failed",
        description: errorMessage.includes("not installed")
          ? "WhisperX not installed on server. Please install it."
          : errorMessage.includes("too large")
          ? "Audio file is too large. Try recording a shorter message."
          : "Could not transcribe audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
      setIsVoiceMode(false);
      buttonModeRef.current = "send";
    }
  };

  const speakText = async (text: string, messageId: string) => {
    try {
      // If clicking the same message that's playing, stop it
      if (playingMessageId === messageId) {
        if (currentAudioRef.current) {
          // Force stop the audio
          try {
            currentAudioRef.current.pause();
            currentAudioRef.current.currentTime = 0;
            currentAudioRef.current.removeAttribute("src");
            currentAudioRef.current.load(); // Reset the audio element
          } catch (e) {
            console.log("Error stopping audio:", e);
          }
          currentAudioRef.current = null;
        }
        setPlayingMessageId(null);
        toast({
          title: "⏹️ Stopped",
          description: "Audio playback stopped",
        });
        return;
      }

      // Stop any other currently playing audio
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.removeAttribute("src");
          currentAudioRef.current.load();
        } catch (e) {
          console.log("Error stopping previous audio:", e);
        }
        currentAudioRef.current = null;
      }

      setPlayingMessageId(messageId);

      // Call TTS API
      const response = await apiRequest(API_ENDPOINTS.TEXT_TO_SPEECH, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `text=${encodeURIComponent(text)}`,
      });

      if (!response.ok) {
        throw new Error("TTS request failed");
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        setPlayingMessageId(null);
        currentAudioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setPlayingMessageId(null);
        currentAudioRef.current = null;
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Playback failed",
          description: "Could not play audio. Please try again.",
          variant: "destructive",
        });
      };

      await audio.play();
      // Audio playing - no toast needed
    } catch (error) {
      console.error("TTS error:", error);
      setPlayingMessageId(null);
      toast({
        title: "Text-to-speech failed",
        description: "Could not convert text to speech. Please try again.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      // Convert markdown to plain text by removing common markdown syntax
      const plainText = content
        // Remove headers
        .replace(/^#{1,6}\s+/gm, "")
        // Remove bold/italic
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        // Remove links [text](url) -> text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        // Remove inline code
        .replace(/`([^`]+)`/g, "$1")
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, "")
        // Remove blockquotes
        .replace(/^>\s+/gm, "")
        // Clean up extra whitespace
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      await navigator.clipboard.writeText(plainText);
      setCopiedMessageId(messageId);

      toast({
        title: "✓ Copied",
      });

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    } catch (error) {
      console.error("Copy error:", error);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleQuerySubmission = async (
    e: FormEvent | React.MouseEvent | React.TouchEvent,
    promptText?: string
  ) => {
    e.preventDefault();

    const queryText = promptText || currentQuery;
    if (!queryText.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: queryText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setCurrentQuery("");
    setIsProcessing(true);

    const steps: ProcessingStep[] = [
      {
        id: "1",
        label: "Receiving query",
        status: "complete",
        icon: <CheckCircle2 className="h-4 w-4" />,
      },
      {
        id: "2",
        label: "Generating embeddings",
        status: "active",
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
      },
      {
        id: "3",
        label: "Searching vector database",
        status: "pending",
        icon: <Loader2 className="h-4 w-4" />,
      },
      {
        id: "4",
        label: "Retrieving relevant chunks",
        status: "pending",
        icon: <Loader2 className="h-4 w-4" />,
      },
      {
        id: "5",
        label: "Generating response",
        status: "pending",
        icon: <Loader2 className="h-4 w-4" />,
      },
      {
        id: "6",
        label: "Formatting answer",
        status: "pending",
        icon: <Loader2 className="h-4 w-4" />,
      },
    ];
    setProcessingSteps(steps);

    try {
      setTimeout(() => {
        setProcessingSteps((prev) =>
          prev.map((s, i) =>
            i === 1
              ? {
                  ...s,
                  status: "complete",
                  icon: <CheckCircle2 className="h-4 w-4" />,
                }
              : i === 2
              ? {
                  ...s,
                  status: "active",
                  icon: <Loader2 className="h-4 w-4 animate-spin" />,
                }
              : s
          )
        );
      }, 300);

      setTimeout(() => {
        setProcessingSteps((prev) =>
          prev.map((s, i) =>
            i === 2
              ? {
                  ...s,
                  status: "complete",
                  icon: <CheckCircle2 className="h-4 w-4" />,
                }
              : i === 3
              ? {
                  ...s,
                  status: "active",
                  icon: <Loader2 className="h-4 w-4 animate-spin" />,
                }
              : s
          )
        );
      }, 600);

      const response = await apiPost(API_ENDPOINTS.ASK, {
        query: queryText,
        provider: aiProvider,
      });

      setProcessingSteps((prev) =>
        prev.map((s, i) =>
          i === 3
            ? {
                ...s,
                status: "complete",
                icon: <CheckCircle2 className="h-4 w-4" />,
              }
            : i === 4
            ? {
                ...s,
                status: "active",
                icon: <Loader2 className="h-4 w-4 animate-spin" />,
              }
            : s
        )
      );

      if (!response.ok) throw new Error("Query failed");

      const data = await response.json();

      setProcessingSteps((prev) =>
        prev.map((s, i) =>
          i === 4
            ? {
                ...s,
                status: "complete",
                icon: <CheckCircle2 className="h-4 w-4" />,
              }
            : i === 5
            ? {
                ...s,
                status: "active",
                icon: <Loader2 className="h-4 w-4 animate-spin" />,
              }
            : s
        )
      );

      setTimeout(() => {
        setProcessingSteps((prev) =>
          prev.map((s) => ({
            ...s,
            status: "complete",
            icon: <CheckCircle2 className="h-4 w-4" />,
          }))
        );
      }, 200);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Unable to process query. Please check if the backend is running.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProcessingSteps([]), 500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large Floating Gradient Circles */}
        <div
          className="absolute top-20 left-10 w-80 h-80 bg-blue-400/10 dark:bg-blue-400/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "4s" }}
        />
        <div
          className="absolute bottom-32 right-16 w-96 h-96 bg-purple-400/10 dark:bg-purple-400/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "5s", animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-64 h-64 bg-indigo-400/10 dark:bg-indigo-400/20 rounded-full blur-2xl animate-pulse"
          style={{ animationDuration: "6s", animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-72 h-72 bg-pink-400/8 dark:bg-pink-400/15 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: "7s", animationDelay: "1.5s" }}
        />

        {/* Geometric Shapes - Squares & Rectangles */}
        <div className="absolute top-40 right-20 w-24 h-24 border-2 border-blue-400/30 dark:border-blue-400/40 rounded-lg rotate-12 animate-float" />
        <div
          className="absolute top-32 left-1/4 w-16 h-16 border-2 border-purple-400/25 dark:border-purple-400/35 rounded-lg -rotate-45 animate-float"
          style={{ animationDelay: "0.5s" }}
        />
        <div
          className="absolute bottom-48 left-32 w-20 h-20 border-2 border-indigo-400/25 dark:border-indigo-400/35 rounded-lg rotate-6 animate-float"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-1/3 right-40 w-18 h-18 border-2 border-pink-400/30 dark:border-pink-400/40 rounded-lg -rotate-12 animate-float"
          style={{ animationDelay: "3s" }}
        />
        <div
          className="absolute top-2/3 right-1/3 w-14 h-14 border-2 border-blue-300/25 dark:border-blue-400/35 rounded-lg rotate-45 animate-float"
          style={{ animationDelay: "2.5s" }}
        />
        <div
          className="absolute top-1/4 left-1/2 w-20 h-20 border-2 border-purple-300/20 dark:border-purple-400/30 rounded-lg -rotate-30 animate-float"
          style={{ animationDelay: "1.8s" }}
        />

        {/* Circles */}
        <div
          className="absolute bottom-48 left-1/4 w-24 h-24 border-2 border-purple-400/30 dark:border-purple-400/40 rounded-full animate-float"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-16 w-16 h-16 border-2 border-indigo-400/30 dark:border-indigo-400/40 rounded-full animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/3 right-32 w-20 h-20 border-2 border-pink-400/25 dark:border-pink-400/35 rounded-full animate-float"
          style={{ animationDelay: "2.8s" }}
        />
        <div
          className="absolute bottom-1/4 left-1/3 w-18 h-18 border-2 border-blue-400/25 dark:border-blue-400/35 rounded-full animate-float"
          style={{ animationDelay: "3.2s" }}
        />

        {/* Triangles (rotated squares) */}
        <div
          className="absolute top-1/2 right-24 w-16 h-16 border-2 border-indigo-400/30 dark:border-indigo-400/40 rotate-45 animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-1/2 left-1/4 w-14 h-14 border-2 border-pink-400/25 dark:border-pink-400/35 rotate-45 animate-float"
          style={{ animationDelay: "3.5s" }}
        />
        <div
          className="absolute top-3/4 right-1/2 w-12 h-12 border-2 border-blue-400/30 dark:border-blue-400/40 rotate-45 animate-float"
          style={{ animationDelay: "1.2s" }}
        />

        {/* Dots Patterns - More Scattered */}
        <div className="absolute top-60 left-1/4 grid grid-cols-3 gap-3 opacity-30">
          <div className="w-2.5 h-2.5 bg-blue-400 rounded-full" />
          <div className="w-2.5 h-2.5 bg-purple-400 rounded-full" />
          <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full" />
        </div>
        <div className="absolute bottom-40 right-1/3 grid grid-cols-2 gap-2 opacity-30">
          <div className="w-2 h-2 bg-pink-400 rounded-full" />
          <div className="w-2 h-2 bg-blue-400 rounded-full" />
        </div>
        <div className="absolute top-1/3 left-1/3 grid grid-cols-4 gap-2 opacity-25">
          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
          <div className="w-1.5 h-1.5 bg-pink-400 rounded-full" />
        </div>
        <div className="absolute bottom-1/3 left-1/2 grid grid-cols-3 gap-2.5 opacity-30">
          <div className="w-2 h-2 bg-purple-400 rounded-full" />
          <div className="w-2 h-2 bg-indigo-400 rounded-full" />
          <div className="w-2 h-2 bg-blue-400 rounded-full" />
        </div>

        {/* Line Accents - More Throughout */}
        <div className="absolute top-1/4 right-12 w-32 h-0.5 bg-gradient-to-r from-transparent via-blue-400/40 to-transparent rotate-45" />
        <div className="absolute bottom-1/4 left-20 w-40 h-0.5 bg-gradient-to-r from-transparent via-purple-400/40 to-transparent -rotate-12" />
        <div className="absolute top-1/2 left-1/4 w-28 h-0.5 bg-gradient-to-r from-transparent via-indigo-400/35 to-transparent rotate-30" />
        <div className="absolute bottom-1/3 right-1/4 w-36 h-0.5 bg-gradient-to-r from-transparent via-pink-400/35 to-transparent -rotate-45" />
        <div className="absolute top-3/4 right-1/3 w-24 h-0.5 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent rotate-60" />

        {/* Plus Signs */}
        <div className="absolute top-1/4 left-16 opacity-20">
          <div className="w-12 h-0.5 bg-blue-400 absolute top-1/2 left-0 transform -translate-y-1/2" />
          <div className="h-12 w-0.5 bg-blue-400 absolute left-1/2 top-0 transform -translate-x-1/2" />
        </div>
        <div className="absolute bottom-1/3 right-20 opacity-20">
          <div className="w-10 h-0.5 bg-purple-400 absolute top-1/2 left-0 transform -translate-y-1/2" />
          <div className="h-10 w-0.5 bg-purple-400 absolute left-1/2 top-0 transform -translate-x-1/2" />
        </div>

        {/* Star-like elements (X shapes) */}
        <div className="absolute top-2/3 left-1/3 w-8 h-8 opacity-25">
          <div className="w-full h-0.5 bg-indigo-400 absolute top-1/2 left-0 transform -translate-y-1/2 rotate-45" />
          <div className="w-full h-0.5 bg-indigo-400 absolute top-1/2 left-0 transform -translate-y-1/2 -rotate-45" />
        </div>
        <div className="absolute top-1/3 right-1/3 w-10 h-10 opacity-25">
          <div className="w-full h-0.5 bg-pink-400 absolute top-1/2 left-0 transform -translate-y-1/2 rotate-45" />
          <div className="w-full h-0.5 bg-pink-400 absolute top-1/2 left-0 transform -translate-y-1/2 -rotate-45" />
        </div>
      </div>
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-center px-4 py-6 md:pt-16 lg:pt-20 overflow-y-auto">
          <div className="max-w-5xl w-full space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="space-y-3">
              <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-purple-400 dark:to-pink-400">
                Hi, let's get started.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                Ask cogent-x anything about your ingested documents. I'll
                provide detailed answers with source citations.
              </p>
            </div>

            {/* Features Badges */}
            <div className="flex flex-wrap gap-2 justify-center">
              <Badge
                variant="secondary"
                className="text-xs sm:text-sm px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 shadow-sm"
              >
                <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" /> Semantic
                Search
              </Badge>
              <Badge
                variant="secondary"
                className="text-xs sm:text-sm px-3 py-1.5 bg-gradient-to-r from-purple-500/10 to-purple-600/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 shadow-sm"
              >
                <Lightbulb className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" />{" "}
                RAG-Powered
              </Badge>
              <Badge
                variant="secondary"
                className="text-xs sm:text-sm px-3 py-1.5 bg-gradient-to-r from-pink-500/10 to-pink-600/10 text-pink-700 dark:text-pink-300 border border-pink-500/30 shadow-sm"
              >
                <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" /> Source
                Citations
              </Badge>
            </div>

            {/* Quick Prompts Section */}
            <div className="space-y-3 pb-4">
              <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold text-muted-foreground">
                <span className="text-lg sm:text-xl">💡</span>
                <span>Quick Start Prompts</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-w-6xl mx-auto">
                {quickPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      setCurrentQuery(prompt);
                      handleQuerySubmission(e, prompt);
                    }}
                    className="group relative p-3 text-left rounded-lg bg-white dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                      {prompt}
                    </p>
                  </button>
                ))}
              </div>

              <p className="text-[10px] sm:text-xs text-muted-foreground/70 mt-2">
                👆 Click any prompt to start exploring your knowledge base
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 px-3 sm:px-4 md:px-6 lg:px-8 pb-40">
          <div className="max-w-7xl mx-auto space-y-4 py-6">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-in slide-in-from-bottom-2 duration-300`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="max-w-[85%] sm:max-w-[75%] lg:max-w-[70%]">
                  <div
                    className={`rounded-2xl px-5 sm:px-6 py-4 sm:py-4 ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/20"
                        : "bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-800 dark:to-slate-800/90 border-2 border-blue-400/60 dark:border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.3)] dark:shadow-[0_0_25px_rgba(59,130,246,0.4)]"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:bg-muted/50">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => (
                              <p className="mb-3 last:mb-0 text-[15px] sm:text-base leading-[1.7] text-slate-800 dark:text-slate-200 font-normal">
                                {children}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className="mb-3 ml-5 space-y-2 text-[15px] sm:text-base">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="mb-3 ml-5 space-y-2 text-[15px] sm:text-base">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="text-[15px] sm:text-base text-slate-700 dark:text-slate-300 leading-[1.6]">
                                {children}
                              </li>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-xl sm:text-2xl font-bold mb-3 text-slate-900 dark:text-slate-100">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-lg sm:text-xl font-semibold mb-2.5 text-slate-900 dark:text-slate-100">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-base sm:text-lg font-semibold mb-2 text-slate-800 dark:text-slate-200">
                                {children}
                              </h3>
                            ),
                            code: ({ children }) => (
                              <code className="bg-muted px-1.5 py-0.5 rounded text-xs sm:text-sm font-mono border border-border/50">
                                {children}
                              </code>
                            ),
                            pre: ({ children }) => (
                              <pre className="bg-muted/70 p-3 sm:p-4 rounded-lg overflow-x-auto text-xs sm:text-sm border border-border/50 my-3">
                                {children}
                              </pre>
                            ),
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                className="text-primary hover:text-primary/80 underline decoration-2 underline-offset-2 transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {children}
                              </a>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-4 border-primary/30 pl-4 py-1 italic text-muted-foreground my-3">
                                {children}
                              </blockquote>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[15px] sm:text-base whitespace-pre-wrap break-words leading-[1.6] font-medium">
                        {message.content}
                      </p>
                    )}
                  </div>

                  {message.sources && message.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3.5">
                      {message.sources.map((source, index) => (
                        <button
                          key={index}
                          onClick={() =>
                            setViewingSource({
                              url: source.url,
                              usedChunks: source.used_chunks.map(
                                (c) => c.index
                              ),
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/80 dark:from-blue-950/40 dark:to-blue-900/30 hover:from-blue-100 hover:to-blue-200/80 dark:hover:from-blue-900/50 dark:hover:to-blue-800/40 text-blue-700 dark:text-blue-300 transition-all duration-200 border border-blue-200/60 dark:border-blue-800/50 shadow-sm hover:shadow-md text-xs font-medium"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>
                            Source {index + 1} ({source.used_chunks.length})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Text-to-Speech and Copy buttons for assistant messages */}
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mt-3.5">
                      <button
                        onClick={() => speakText(message.content, message.id)}
                        disabled={playingMessageId === message.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md ${
                          playingMessageId === message.id
                            ? "bg-gradient-to-br from-green-100 to-green-50 dark:from-green-950/40 dark:to-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800"
                            : "bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/80 text-slate-700 dark:text-slate-300 hover:from-slate-200 hover:to-slate-100 dark:hover:from-slate-700 dark:hover:to-slate-700/80 border border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        {playingMessageId === message.id ? (
                          <>
                            <VolumeX className="h-3.5 w-3.5" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() =>
                          copyToClipboard(message.content, message.id)
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md ${
                          copiedMessageId === message.id
                            ? "bg-gradient-to-br from-green-100 to-green-50 dark:from-green-950/40 dark:to-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800"
                            : "bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/80 text-slate-700 dark:text-slate-300 hover:from-slate-200 hover:to-slate-100 dark:hover:from-slate-700 dark:hover:to-slate-700/80 border border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        {copiedMessageId === message.id ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-2.5 flex items-center gap-1.5 font-medium">
                    <span className="inline-block w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-600"></span>
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}

            {isProcessing && processingSteps.length > 0 && (
              <div className="flex justify-start animate-in slide-in-from-bottom-4 duration-300">
                <div className="max-w-[85%] sm:max-w-[75%] lg:max-w-[70%]">
                  <div className="bg-white dark:bg-slate-800/90 border border-blue-200 dark:border-blue-800/50 rounded-2xl px-5 py-4 shadow-sm">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/50">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Processing
                        </span>
                      </div>
                      <div className="space-y-2.5 pl-10">
                        {processingSteps.map((step) => (
                          <div
                            key={step.id}
                            className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
                              step.status === "complete"
                                ? "text-green-600 dark:text-green-400"
                                : step.status === "active"
                                ? "text-blue-600 dark:text-blue-400 font-medium"
                                : "text-slate-400 dark:text-slate-600"
                            }`}
                          >
                            <span className="flex-shrink-0">{step.icon}</span>
                            <span className="flex-1">{step.label}</span>
                            {step.status === "complete" && (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            )}
                            {step.status === "active" && (
                              <div className="flex gap-1">
                                <span
                                  className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"
                                  style={{ animationDelay: "0ms" }}
                                ></span>
                                <span
                                  className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"
                                  style={{ animationDelay: "150ms" }}
                                ></span>
                                <span
                                  className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"
                                  style={{ animationDelay: "300ms" }}
                                ></span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-white/90 dark:from-slate-950 dark:via-slate-950/95 dark:to-slate-950/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 shadow-[0_-2px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_24px_rgba(0,0,0,0.4)] z-40 pb-10">
        <div className="container mx-auto px-6 sm:px-8 md:px-12 lg:px-16 py-3">
          <form onSubmit={handleQuerySubmission}>
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <div className="flex-1 relative">
                <Input
                  value={currentQuery}
                  onChange={(e) => setCurrentQuery(e.target.value)}
                  placeholder={
                    isRecording
                      ? "🎤 Listening..."
                      : isTranscribing
                      ? "⏳ Transcribing..."
                      : "Ask cogent-x anything about your documents..."
                  }
                  disabled={isProcessing || isRecording || isTranscribing}
                  className="w-full text-base h-14 rounded-2xl border-3 border-blue-400 dark:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/40 focus-visible:border-blue-600 shadow-[0_2px_16px_rgba(59,130,246,0.2)] hover:shadow-[0_4px_24px_rgba(59,130,246,0.3)] dark:shadow-[0_2px_20px_rgba(59,130,246,0.3)] dark:hover:shadow-[0_4px_28px_rgba(59,130,246,0.4)] transition-all duration-200 bg-white dark:bg-slate-900 placeholder:text-slate-400 font-medium pr-4"
                />
              </div>

              {/* Clean Unified Send/Mic Button */}
              <div className="shrink-0">
                <button
                  type="button"
                  disabled={isProcessing || isTranscribing}
                  className="group relative h-14 w-14 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 overflow-hidden border-3 border-blue-400 dark:border-blue-500 hover:border-blue-500 dark:hover:border-blue-400"
                  onClick={(e) => {
                    if (buttonModeRef.current === "send") {
                      if (currentQuery.trim()) {
                        handleQuerySubmission(e);
                      } else {
                        buttonModeRef.current = "mic";
                        setIsVoiceMode(true);
                        startRecording();
                      }
                    } else {
                      stopRecording();
                    }
                  }}
                  onTouchStart={() => {
                    if (
                      buttonModeRef.current === "send" &&
                      !currentQuery.trim()
                    ) {
                      longPressTimerRef.current = setTimeout(() => {
                        buttonModeRef.current = "mic";
                        setIsVoiceMode(true);
                        startRecording();
                      }, 200);
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                    }
                    if (isRecording) {
                      stopRecording();
                      setTimeout(() => {
                        if (currentQuery.trim()) {
                          const evt = new Event("submit", {
                            bubbles: true,
                            cancelable: true,
                          }) as unknown as FormEvent;
                          handleQuerySubmission(evt);
                        }
                      }, 1000);
                    } else if (
                      buttonModeRef.current === "send" &&
                      currentQuery.trim()
                    ) {
                      handleQuerySubmission(e);
                    }
                  }}
                  onMouseLeave={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                    }
                  }}
                >
                  {/* Background Gradient */}
                  <div
                    className={`absolute inset-0 transition-all duration-300 rounded-2xl ${
                      isRecording
                        ? "bg-gradient-to-br from-red-500 to-red-600"
                        : currentQuery.trim()
                        ? "bg-gradient-to-br from-blue-600 to-indigo-600 group-hover:from-blue-700 group-hover:to-indigo-700"
                        : "bg-gradient-to-br from-slate-700 to-slate-800 group-hover:from-blue-600 group-hover:to-indigo-600"
                    }`}
                  />

                  {/* Icon Display */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isRecording ? (
                      <div className="relative">
                        <Mic className="h-6 w-6 text-white animate-pulse" />
                        <div className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-white rounded-full animate-ping" />
                      </div>
                    ) : currentQuery.trim() ? (
                      <Send className="h-5 w-5 text-white transition-transform group-hover:scale-110 group-hover:translate-x-0.5" />
                    ) : (
                      <Mic className="h-5 w-5 text-white transition-transform group-hover:scale-110" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Source Modal */}
      <SourceModal
        url={viewingSource?.url || null}
        usedChunks={viewingSource?.usedChunks || []}
        onClose={() => setViewingSource(null)}
      />
    </div>
  );
};

export default QueryInterface;
