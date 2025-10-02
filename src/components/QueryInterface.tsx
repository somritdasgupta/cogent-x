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

      toast({
        title: "Recording started",
        description: "Speak your question now",
      });
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

    // Show processing toast
    toast({
      title: "Transcribing...",
      description: "Converting your speech to text",
    });

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
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.src = "";
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
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = "";
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

      toast({
        title: "🔊 Playing answer",
        description: "Text-to-speech enabled",
      });
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
        title: "✅ Copied!",
        description: "Answer copied to clipboard",
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
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/20">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-center px-4 pt-20 sm:pt-20">
          <div className="max-w-2xl space-y-6 animate-in fade-in duration-500">
            <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-purple-400 dark:to-pink-400">
              Hi, let's get started.
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Ask cogent-x anything about your ingested documents. It will
              provide detailed answers with source citations.
            </p>

            <div className="flex flex-wrap gap-2 justify-center">
              <Badge
                variant="secondary"
                className="text-xs px-3 py-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
              >
                <Sparkles className="h-3 w-3 mr-1" /> Semantic Search
              </Badge>
              <Badge
                variant="secondary"
                className="text-xs px-3 py-1.5 bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
              >
                <Lightbulb className="h-3 w-3 mr-1" /> RAG-Powered
              </Badge>
              <Badge
                variant="secondary"
                className="text-xs px-3 py-1.5 bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20"
              >
                <BookOpen className="h-3 w-3 mr-1" /> Source Citations
              </Badge>
            </div>

            <div className="pt-4">
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 font-medium px-2 sm:px-0">
                💡 Try these quick prompts:
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                {quickPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      setCurrentQuery(prompt);
                      handleQuerySubmission(e, prompt);
                    }}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-lg sm:rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-blue-100 hover:to-purple-100 dark:hover:from-blue-900/30 dark:hover:to-purple-900/30 border border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-3 text-center px-2 sm:px-0">
                👆 Tap any prompt to instantly ask a question
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 px-3 sm:px-4 md:px-6 lg:px-8 pb-40">
          <div className="max-w-6xl mx-auto space-y-4 py-6">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-in slide-in-from-bottom-2 duration-300`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="max-w-[85%] sm:max-w-[80%] lg:max-w-[75%]">
                  <div
                    className={`rounded-2xl px-4 sm:px-5 py-3 sm:py-4 shadow-lg ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 text-white dark:from-blue-500 dark:via-blue-500 dark:to-blue-600 ring-1 ring-blue-500/20"
                        : "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border-2 border-slate-200 dark:border-slate-700 backdrop-blur-sm"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:bg-muted/50">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => (
                              <p className="mb-3 last:mb-0 text-sm sm:text-base leading-relaxed text-foreground">
                                {children}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className="mb-3 ml-5 space-y-1.5 text-sm sm:text-base">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="mb-3 ml-5 space-y-1.5 text-sm sm:text-base">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="text-sm sm:text-base text-foreground/90">
                                {children}
                              </li>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-xl sm:text-2xl font-bold mb-3 text-foreground">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-lg sm:text-xl font-semibold mb-2.5 text-foreground">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-base sm:text-lg font-semibold mb-2 text-foreground">
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
                      <p className="text-sm sm:text-base whitespace-pre-wrap break-words leading-relaxed font-semibold">
                        {message.content}
                      </p>
                    )}
                  </div>

                  {message.sources && message.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 px-1">
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 text-blue-700 dark:text-blue-300 transition-all duration-200 hover:scale-105 border border-blue-500/30 shadow-sm hover:shadow-md cursor-pointer"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span className="text-xs font-medium">
                            Source {index + 1} ({source.used_chunks.length}{" "}
                            chunk{source.used_chunks.length !== 1 ? "s" : ""})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Text-to-Speech and Copy buttons for assistant messages */}
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mt-3 px-1">
                      <button
                        onClick={() => speakText(message.content, message.id)}
                        disabled={playingMessageId === message.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md ${
                          playingMessageId === message.id
                            ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-700 dark:text-green-300 border border-green-500/30 animate-pulse"
                            : "bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                        }`}
                      >
                        {playingMessageId === message.id ? (
                          <>
                            <VolumeX className="h-3 w-3" />
                            <span className="text-xs font-medium">
                              Stop Audio
                            </span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3 w-3" />
                            <span className="text-xs font-medium">
                              Listen to Answer
                            </span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() =>
                          copyToClipboard(message.content, message.id)
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md ${
                          copiedMessageId === message.id
                            ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-700 dark:text-green-300 border border-green-500/30"
                            : "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 hover:from-blue-500/20 hover:to-cyan-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30"
                        }`}
                      >
                        {copiedMessageId === message.id ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span className="text-xs font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span className="text-xs font-medium">
                              Copy Answer
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <p className="text-[10px] sm:text-xs text-muted-foreground/70 px-1 mt-2 flex items-center gap-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40"></span>
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
                <div className="max-w-[85%] sm:max-w-[80%] lg:max-w-[75%]">
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-2xl px-4 sm:px-5 py-4 shadow-lg backdrop-blur-sm">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 mb-3">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                          Processing your query...
                        </span>
                      </div>
                      <div className="space-y-2">
                        {processingSteps.map((step) => (
                          <div
                            key={step.id}
                            className={`flex items-center gap-2.5 text-xs transition-all duration-300 ${
                              step.status === "complete"
                                ? "text-green-700 dark:text-green-400"
                                : step.status === "active"
                                ? "text-blue-700 dark:text-blue-400 font-medium"
                                : "text-slate-400 dark:text-slate-600"
                            }`}
                          >
                            <span
                              className={`transition-all ${
                                step.status === "complete"
                                  ? "text-green-600 dark:text-green-400"
                                  : step.status === "active"
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {step.icon}
                            </span>
                            <span>{step.label}</span>
                            {step.status === "complete" && (
                              <span className="ml-auto text-green-600 dark:text-green-400 text-[10px] font-medium">
                                ✓ Done
                              </span>
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

      {/* Premium fixed bottom input bar with unified send/mic button */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/98 to-background/95 backdrop-blur-2xl border-t-2 border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)] z-40 pb-10">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          <form onSubmit={handleQuerySubmission}>
            <div className="max-w-6xl mx-auto flex gap-2 sm:gap-3">
              <Input
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                placeholder={
                  isRecording
                    ? "🎤 Listening..."
                    : isTranscribing
                    ? "⏳ Transcribing..."
                    : "Ask a question about your documents..."
                }
                disabled={isProcessing || isRecording || isTranscribing}
                className="flex-1 text-sm sm:text-base h-12 sm:h-14 rounded-2xl border-2 border-slate-300 dark:border-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-lg bg-white dark:bg-slate-900 font-medium placeholder:text-slate-400"
              />

              {/* Unified Send/Mic Button */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  disabled={isProcessing || isTranscribing}
                  className="group relative h-12 w-24 sm:h-14 sm:w-28 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 overflow-hidden"
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
                  <div
                    className={`absolute inset-0 transition-all duration-300 ${
                      isRecording
                        ? "bg-gradient-to-br from-red-500 to-red-600 animate-pulse"
                        : isVoiceMode && !isRecording
                        ? "bg-gradient-to-br from-orange-500 to-red-500"
                        : "bg-gradient-to-br from-blue-600 to-blue-700 group-hover:from-blue-700 group-hover:to-blue-800"
                    }`}
                  />

                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/20" />

                  <div
                    className={`absolute inset-y-0 left-0 right-1/2 flex items-center justify-center transition-all duration-300 ${
                      isRecording || (isVoiceMode && !currentQuery.trim())
                        ? "bg-white/10"
                        : ""
                    }`}
                  >
                    <Mic
                      className={`h-5 w-5 sm:h-6 sm:w-6 text-white transition-transform duration-200 ${
                        isRecording ? "scale-110" : "group-hover:scale-110"
                      }`}
                    />
                  </div>

                  <div
                    className={`absolute inset-y-0 right-0 left-1/2 flex items-center justify-center transition-all duration-300 ${
                      currentQuery.trim() && !isVoiceMode ? "bg-white/10" : ""
                    }`}
                  >
                    <Send
                      className={`h-5 w-5 sm:h-6 sm:w-6 text-white transition-transform duration-200 ${
                        currentQuery.trim()
                          ? "scale-110"
                          : "group-hover:scale-110"
                      }`}
                    />
                  </div>

                  {isRecording && (
                    <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-ping" />
                  )}
                </button>

                <div className="absolute -bottom-5 left-0 right-0 text-center">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {isRecording
                      ? "🎙️ Recording..."
                      : isTranscribing
                      ? "⏳ Processing..."
                      : currentQuery.trim()
                      ? "Click right →"
                      : "Click left ← to speak"}
                  </span>
                </div>
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
