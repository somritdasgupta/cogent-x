import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useTheme } from "next-themes";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Check,
  CheckCircle,
  ChevronRight,
  Copy,
  Bot,
  Database,
  FileText,
  Loader2,
  Linkedin,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Activity,
  SunMedium,
  SlidersHorizontal,
  Trash2,
  Upload,
  WandSparkles,
  WifiOff,
} from "lucide-react";
import { SiGooglegemini, SiGithub, SiOpenai, SiOllama } from "react-icons/si";
import Logo from "@/components/Logo";
import SidePanel from "@/components/SidePanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SourceModal } from "@/components/SourceModal";
import { DocumentSelector } from "@/components/DocumentSelector";
import { ModernSettingsPanel } from "@/components/ModernSettingsPanel";
import { API_ENDPOINTS, apiGet, apiPost, getApiDocsUrl } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import { useOffline } from "@/hooks/use-offline";
import { cn } from "@/lib/utils";

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

interface ChatConversation {
  id: string;
  timestamp: string;
  messages: Message[];
  preview: string;
  conversationId: string;
}

const promptBank = [
  "What should I upload first through a URL?",
  "How do I connect a new source to this workspace?",
  "Which document should I start with?",
  "Can you summarize the files I already added?",
  "How do I switch models for this conversation?",
  "What settings should I change for long documents?",
  "How does ingestion work from a URL?",
  "What can I ask after uploading my docs?",
  "How do I troubleshoot a failed upload?",
  "Which provider is best for private data?",
  "Can you explain the current knowledge base setup?",
  "What is a good first question for my docs?",
];

const providerOptions = [
  {
    value: "opensource",
    label: "Ollama",
    icon: SiOllama,
  },
  {
    value: "openai",
    label: "OpenAI",
    icon: SiOpenai,
  },
  {
    value: "gemini",
    label: "Gemini",
    icon: SiGooglegemini,
  },
] as const;

const pickPrompts = (items: string[], count: number) => {
  const pool = [...items];
  const selected: string[] = [];

  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    const [nextPrompt] = pool.splice(index, 1);
    if (nextPrompt) selected.push(nextPrompt);
  }

  return selected;
};

const readHistory = (): ChatConversation[] => {
  try {
    return JSON.parse(localStorage.getItem("chat_history") || "[]");
  } catch {
    return [];
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const ModernWorkspace = () => {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    return (
      localStorage.getItem("current_conversation_id") || crypto.randomUUID()
    );
  });
  const [conversationTitle, setConversationTitle] =
    useState("New Conversation");
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("chat_messages") || "[]");
    } catch {
      return [];
    }
  });
  const [currentQuery, setCurrentQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasDocuments, setHasDocuments] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>(() => {
    const conversationId =
      localStorage.getItem("current_conversation_id") || crypto.randomUUID();
    try {
      return JSON.parse(
        localStorage.getItem(`selected_docs_${conversationId}`) || "[]",
      );
    } catch {
      return [];
    }
  });
  const [systemStatus, setSystemStatus] = useState({
    backend: false,
    llm: false,
    vectorDB: false,
  });
  const isOffline = useOffline();
  const [aiProvider, setAiProvider] = useState(
    () => localStorage.getItem("aiProvider") || "opensource",
  );
  const [viewingSource, setViewingSource] = useState<{
    url: string;
    usedChunks: number[];
  } | null>(null);
  const [focusedResponse, setFocusedResponse] = useState<Message | null>(null);
  const [isFocusedResponseFullscreen, setIsFocusedResponseFullscreen] =
    useState(false);
  const [repromptTarget, setRepromptTarget] = useState<{
    response: Message;
    originalPrompt: string;
  } | null>(null);
  const [repromptDetails, setRepromptDetails] = useState("");
  const [isReprompting, setIsReprompting] = useState(false);
  const [, setChatHistoryUpdate] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiProviderRef = useRef(aiProvider);

  const prompts = useMemo(() => pickPrompts(promptBank, 3), []);
  const activeProvider = useMemo(() => {
    return (
      providerOptions.find((provider) => provider.value === aiProvider) ||
      providerOptions[0]
    );
  }, [aiProvider]);

  const refreshWorkspaceStatus = useCallback(async () => {
    try {
      const [configRes, healthRes, kbRes, statsRes] = await Promise.all([
        apiGet(API_ENDPOINTS.CONFIG),
        apiGet(API_ENDPOINTS.HEALTH),
        apiGet(API_ENDPOINTS.KNOWLEDGE_BASES),
        apiGet(API_ENDPOINTS.DATABASE_STATS),
      ]);

      if (configRes.ok) {
        const config = await configRes.json();
        setIsConfigured(!!(config.openai_api_key || config.gemini_api_key));
      }

      if (healthRes.ok) {
        setSystemStatus(await healthRes.json());
      }

      if (kbRes.ok) {
        const data = await kbRes.json();
        setAvailableDocuments(data.knowledge_bases || []);
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setHasDocuments((stats.total_documents || 0) > 0);
      }
    } catch {
      setSystemStatus({ backend: false, llm: false, vectorDB: false });
    }
  }, []);

  const handleProviderChange = useCallback((nextProvider: string) => {
    setAiProvider(nextProvider);
    localStorage.setItem("aiProvider", nextProvider);
    try {
      window.dispatchEvent(
        new CustomEvent("aiProviderChanged", { detail: nextProvider }),
      );
    } catch {
      window.dispatchEvent(new Event("storage"));
    }
  }, []);

  useEffect(() => {
    aiProviderRef.current = aiProvider;
    localStorage.setItem("aiProvider", aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    localStorage.setItem(
      `selected_docs_${currentConversationId}`,
      JSON.stringify(selectedDocuments),
    );
  }, [selectedDocuments, currentConversationId]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<string>;
      if (ce && ce.detail) {
        setAiProvider(ce.detail);
      }
    };

    const storageHandler = (ev: StorageEvent) => {
      if (ev.key === "aiProvider") {
        setAiProvider(ev.newValue || "opensource");
      }
    };

    window.addEventListener("aiProviderChanged", handler as EventListener);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("aiProviderChanged", handler as EventListener);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("chat_messages", JSON.stringify(messages));
    if (!currentConversationId || messages.length === 0) return;

    const history = readHistory();
    const index = history.findIndex(
      (item) => item.conversationId === currentConversationId,
    );
    const firstUserMessage = messages.find(
      (message) => message.role === "user",
    );
    const preview = firstUserMessage
      ? `${firstUserMessage.content.substring(0, 50)}${firstUserMessage.content.length > 50 ? "..." : ""}`
      : "New conversation";

    const nextConversation: ChatConversation = {
      id: index >= 0 ? history[index].id : Date.now().toString(),
      timestamp: new Date().toISOString(),
      messages: [...messages],
      preview,
      conversationId: currentConversationId,
    };

    if (index >= 0) {
      history[index] = nextConversation;
    } else {
      history.unshift(nextConversation);
    }

    localStorage.setItem("chat_history", JSON.stringify(history.slice(0, 50)));
  }, [messages, currentConversationId]);

  useEffect(() => {
    refreshWorkspaceStatus();
    const interval = setInterval(refreshWorkspaceStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshWorkspaceStatus]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  const startNewChat = useCallback(() => {
    const newConversationId = crypto.randomUUID();
    setCurrentConversationId(newConversationId);
    setConversationTitle("New Conversation");
    setCurrentQuery("");
    setMessages([]);
    localStorage.setItem("current_conversation_id", newConversationId);
    localStorage.setItem("chat_messages", "[]");
    toast({
      title: "New chat ready",
      description: "A fresh conversation has started.",
    });
  }, [toast]);

  const selectConversation = useCallback((conversation: ChatConversation) => {
    const conversationId = conversation.conversationId || conversation.id;
    setMessages(conversation.messages);
    setCurrentConversationId(conversationId);
    setConversationTitle(conversation.preview || "Conversation");
    localStorage.setItem(
      "chat_messages",
      JSON.stringify(conversation.messages),
    );
    localStorage.setItem("current_conversation_id", conversationId);

    // Load selected documents for this conversation
    try {
      const savedDocs = JSON.parse(
        localStorage.getItem(`selected_docs_${conversationId}`) || "[]",
      );
      setSelectedDocuments(savedDocs);
    } catch {
      setSelectedDocuments([]);
    }
  }, []);

  const deleteConversation = useCallback(
    (id: string, moveDocsToGlobal?: boolean) => {
      const history = readHistory().filter((item) => item.id !== id);
      localStorage.setItem("chat_history", JSON.stringify(history));

      if (
        history.every((item) => item.conversationId !== currentConversationId)
      ) {
        setMessages([]);
        setConversationTitle("New Conversation");
        setCurrentConversationId(crypto.randomUUID());
        localStorage.removeItem("chat_messages");
      }
      setChatHistoryUpdate((prev) => prev + 1);
    },
    [currentConversationId],
  );

  const copyToClipboard = async (content: string, messageId: string) => {
    const plainText = content
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^>\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    await navigator.clipboard.writeText(plainText);
    setCopiedMessageId(messageId);
    toast({ title: "Copied" });
    setTimeout(() => setCopiedMessageId(null), 1600);
  };

  const getPreviousUserPrompt = useCallback(
    (messageId: string) => {
      const messageIndex = messages.findIndex(
        (message) => message.id === messageId,
      );
      if (messageIndex < 0) return "";

      for (let index = messageIndex - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === "user") return message.content;
      }

      return "";
    },
    [messages],
  );

  const openResponseInNewTab = useCallback(
    (message: Message, prompt: string, autoPrint = false) => {
      const title = `Cogent-x response ${new Date(
        message.timestamp,
      ).toLocaleString()}`;
      const md = message.content;
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#080b12;color:#e2e8f0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
    .blobs{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
    .blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.15}
    .b1{width:600px;height:600px;top:-200px;left:-150px;background:radial-gradient(circle,#8b5cf6,transparent 70%)}
    .b2{width:500px;height:500px;top:5%;right:-150px;background:radial-gradient(circle,#a855f7,transparent 70%)}
    .b3{width:400px;height:400px;bottom:-100px;left:30%;background:radial-gradient(circle,#22d3ee,transparent 70%)}
    main{position:relative;z-index:1;width:min(860px,100%);margin:0 auto;padding:clamp(32px,4vw,56px) clamp(24px,5vw,64px)}
    .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(139,92,246,.35);background:rgba(139,92,246,.1);border-radius:999px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a78bfa;margin-bottom:20px}
    .prompt-card{border:1px solid rgba(139,92,246,.3);background:linear-gradient(135deg,rgba(139,92,246,.12),rgba(8,11,18,.8));border-radius:20px;padding:clamp(18px,4vw,28px);margin-bottom:28px}
    .prompt-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#7c3aed;margin-bottom:10px}
    .prompt-text{font-size:clamp(18px,3.5vw,26px);font-weight:600;line-height:1.3;color:#f1f5f9;overflow-wrap:anywhere}
    .meta{font-size:12px;color:#64748b;margin-top:10px}
    .response-card{border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.03);border-radius:20px;padding:clamp(20px,4vw,32px)}
    .prose{line-height:1.75;font-size:clamp(14px,2vw,15.5px);color:#cbd5e1}
    .prose p{margin:.85em 0;overflow-wrap:anywhere}
    .prose h1,.prose h2,.prose h3,.prose h4{color:#f1f5f9;font-weight:600;margin:1.4em 0 .5em;line-height:1.25}
    .prose h1{font-size:1.5em}.prose h2{font-size:1.25em}.prose h3{font-size:1.1em}
    .prose ul,.prose ol{padding-left:1.5em;margin:.75em 0}
    .prose li{margin:.3em 0}
    .prose code{background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.25);border-radius:6px;padding:2px 7px;font-size:.85em;font-family:ui-monospace,monospace;color:#c4b5fd;word-break:break-all}
    .prose pre{background:rgba(0,0,0,.5);border:1px solid rgba(148,163,184,.15);border-radius:14px;padding:18px 20px;overflow-x:auto;margin:1.2em 0}
    .prose pre code{background:none;border:none;padding:0;color:#e2e8f0;word-break:normal;font-size:.9em}
    .prose blockquote{border-left:3px solid rgba(139,92,246,.5);padding-left:16px;color:#94a3b8;font-style:italic;margin:1em 0}
    .prose a{color:#a78bfa;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
    .prose strong{color:#f1f5f9;font-weight:600}
    .prose hr{border:none;border-top:1px solid rgba(148,163,184,.15);margin:1.5em 0}
    .prose table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.9em}
    .prose th,.prose td{border:1px solid rgba(148,163,184,.15);padding:8px 12px;text-align:left}
    .prose th{background:rgba(139,92,246,.1);color:#e2e8f0;font-weight:600}
    .print-btn{display:inline-flex;align-items:center;gap:6px;margin-top:20px;padding:8px 18px;border:1px solid rgba(139,92,246,.4);border-radius:8px;background:rgba(139,92,246,.12);color:#a78bfa;font-size:12px;font-weight:600;cursor:pointer;transition:background .2s}
    .print-btn:hover{background:rgba(139,92,246,.22)}
    @media print{
      @page{size:A4;margin:18mm 20mm 22mm 20mm}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{background:#fff!important;color:#1a1a2e!important;font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.7}
      .blobs,.print-btn{display:none!important}
      main{width:100%!important;padding:0!important;margin:0!important}
      .chip{border-color:#7c3aed!important;background:#f3f0ff!important;color:#5b21b6!important;margin-bottom:14pt}
      .prompt-card{background:#f8f6ff!important;border:1.5pt solid #c4b5fd!important;border-radius:8pt;padding:14pt 16pt;margin-bottom:18pt;page-break-inside:avoid}
      .prompt-label{color:#5b21b6!important;font-size:8pt;letter-spacing:.18em}
      .prompt-text{color:#1a1a2e!important;font-size:16pt;font-family:Georgia,serif;font-weight:700;line-height:1.3}
      .meta{color:#6b7280!important;font-size:8.5pt;font-family:Inter,sans-serif}
      .response-card{background:#fff!important;border:1pt solid #e5e7eb!important;border-radius:6pt;padding:16pt 18pt;page-break-inside:auto}
      .prose{color:#1f2937!important;font-size:10.5pt;line-height:1.75;font-family:Georgia,'Times New Roman',serif}
      .prose h1,.prose h2,.prose h3,.prose h4{color:#111827!important;font-family:Inter,sans-serif;page-break-after:avoid}
      .prose h1{font-size:16pt;border-bottom:1pt solid #e5e7eb;padding-bottom:4pt;margin-bottom:10pt}
      .prose h2{font-size:13pt;margin-top:16pt}
      .prose h3{font-size:11.5pt;margin-top:12pt}
      .prose p{margin:.6em 0;orphans:3;widows:3}
      .prose ul,.prose ol{padding-left:18pt}
      .prose li{margin:.25em 0}
      .prose code{background:#f3f0ff!important;border:1pt solid #ddd6fe!important;color:#5b21b6!important;font-size:8.5pt;padding:1pt 4pt;border-radius:3pt;font-family:'Courier New',monospace}
      .prose pre{background:#f8f8f8!important;border:1pt solid #e5e7eb!important;border-radius:5pt;padding:10pt 12pt;page-break-inside:avoid;overflow:visible;white-space:pre-wrap;word-break:break-all}
      .prose pre code{background:none!important;border:none!important;color:#1f2937!important;font-size:8pt}
      .prose blockquote{border-left:3pt solid #7c3aed!important;padding-left:12pt;color:#4b5563!important;font-style:italic}
      .prose a{color:#5b21b6!important;text-decoration:underline}
      .prose a::after{content:" (" attr(href) ")";font-size:7.5pt;color:#9ca3af}
      .prose table{border-collapse:collapse;width:100%;font-size:9pt;page-break-inside:avoid}
      .prose th,.prose td{border:1pt solid #d1d5db!important;padding:5pt 8pt}
      .prose th{background:#f3f0ff!important;color:#1f2937!important;font-weight:700}
      .prose tr:nth-child(even) td{background:#fafafa!important}
      .prose strong{color:#111827!important}
      .prose hr{border-top:1pt solid #e5e7eb!important}
      .print-footer{display:block!important;margin-top:24pt;padding-top:8pt;border-top:1pt solid #e5e7eb;font-size:8pt;color:#9ca3af;font-family:Inter,sans-serif;text-align:center}
    }
    .print-footer{display:none}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div class="blobs"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div></div>
  <main>
    <div class="chip">&#10022; Cogent-x</div>
    <div class="prompt-card">
      <div class="prompt-label">Prompt</div>
      <div class="prompt-text">${escapeHtml(prompt || "Assistant response")}</div>
      <div class="meta">${escapeHtml(new Date(message.timestamp).toLocaleString())}</div>
    </div>
    <div class="response-card"><div class="prose" id="md"></div></div>
    <button class="print-btn" onclick="window.print()">&#128438; Print / Save as PDF</button>
    <div class="print-footer">Generated by Cogent-x &mdash; ${escapeHtml(new Date(message.timestamp).toLocaleString())}</div>
  </main>
  <script>document.getElementById('md').innerHTML=marked.parse(${JSON.stringify(md)});${autoPrint ? "window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})" : ""}</script>
</body>
</html>`;
      const blobUrl = URL.createObjectURL(
        new Blob([html], { type: "text/html" }),
      );
      const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        URL.revokeObjectURL(blobUrl);
        toast({
          title: "Popup blocked",
          description: "Allow popups to open the response in a new tab.",
          variant: "destructive",
        });
        return;
      }

      opened.focus();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    },
    [toast],
  );

  const openRepromptDialog = useCallback(
    (response: Message) => {
      const originalPrompt = getPreviousUserPrompt(response.id);
      if (!originalPrompt) {
        toast({
          title: "Could not find the original prompt",
          description: "Start a new retry from the chat box instead.",
          variant: "destructive",
        });
        return;
      }

      setRepromptDetails("");
      setRepromptTarget({ response, originalPrompt });
    },
    [getPreviousUserPrompt, toast],
  );

  const handleRepromptSubmit = useCallback(async () => {
    if (!repromptTarget || isReprompting) return;

    const improvementDetails = repromptDetails.trim();
    if (!improvementDetails) {
      toast({
        title: "Add refinement details",
        description: "Tell the model what should be changed before retrying.",
        variant: "destructive",
      });
      return;
    }

    if (isOffline) {
      toast({
        title: "Offline",
        description: "Internet connection is required to retry a response.",
        variant: "destructive",
      });
      return;
    }

    const retryPrompt = `Please answer the original request again with these improvements.

Original request:
${repromptTarget.originalPrompt}

Previous response that needs improvement:
${repromptTarget.response.content}

What to improve:
${improvementDetails}`;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: `Retry with improvements: ${improvementDetails}`,
      timestamp: new Date(),
    };

    setIsReprompting(true);
    setIsProcessing(true);
    setMessages((prev) => [...prev, userMessage]);
    setRepromptTarget(null);
    setRepromptDetails("");

    try {
      const response = await apiPost(API_ENDPOINTS.ASK, {
        query: retryPrompt,
        provider: aiProviderRef.current,
        conversation_id: currentConversationId,
        selected_documents:
          selectedDocuments.length > 0 ? selectedDocuments : null,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Retry failed");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `Unable to retry response. ${error.message}`
              : "Unable to retry response.",
          timestamp: new Date(),
        },
      ]);
      toast({ title: "Retry failed", variant: "destructive" });
    } finally {
      setIsReprompting(false);
      setIsProcessing(false);
      setChatHistoryUpdate((prev) => prev + 1);
    }
  }, [
    currentConversationId,
    isOffline,
    isReprompting,
    repromptDetails,
    repromptTarget,
    selectedDocuments,
    toast,
  ]);

  const handleQuerySubmission = useCallback(
    async (e: FormEvent | MouseEvent, promptText?: string) => {
      e.preventDefault();
      const queryText = (promptText || currentQuery).trim();
      if (!queryText || isProcessing) return;

      if (isOffline) {
        toast({
          title: "Offline",
          description: "Internet connection is required to send queries.",
          variant: "destructive",
        });
        return;
      }

      if (!isConfigured) {
        toast({
          title: "Setup required",
          description: "Open settings and configure a provider first.",
          variant: "destructive",
        });
        return;
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: queryText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setCurrentQuery("");
      setIsProcessing(true);

      if (messages.length === 0) {
        const title = `${queryText.substring(0, 50)}${queryText.length > 50 ? "..." : ""}`;
        setConversationTitle(title);
      }

      try {
        const response = await apiPost(API_ENDPOINTS.ASK, {
          query: queryText,
          provider: aiProviderRef.current,
          conversation_id: currentConversationId,
          selected_documents:
            selectedDocuments.length > 0 ? selectedDocuments : null,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Query failed");
        }

        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.answer,
          timestamp: new Date(),
          sources: data.sources || [],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content:
              error instanceof Error
                ? `Unable to process query. ${error.message}`
                : "Unable to process query.",
            timestamp: new Date(),
          },
        ]);
        toast({ title: "Query failed", variant: "destructive" });
      } finally {
        setIsProcessing(false);
        setChatHistoryUpdate((prev) => prev + 1);
      }
    },
    [
      aiProviderRef,
      currentConversationId,
      currentQuery,
      isConfigured,
      isProcessing,
      isOffline,
      messages.length,
      selectedDocuments,
      toast,
    ],
  );

  const histories = readHistory();
  const darkMode = theme === "dark";
  const focusedResponsePrompt = focusedResponse
    ? getPreviousUserPrompt(focusedResponse.id)
    : "";

  const renderMessage = (message: Message) => {
    const isUser = message.role === "user";
    return (
      <div
        key={message.id}
        className={`group flex gap-3 sm:gap-4 animate-enter-scale w-full min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`flex flex-col gap-2 max-w-[88%] sm:max-w-[82%] md:max-w-[72%] lg:max-w-[62%] min-w-0 ${isUser ? "items-end" : "items-start"}`}
        >
          <div className="relative w-full min-w-0">
            {!isUser && (
              <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                <div className="absolute -left-5 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/25 via-primary/12 to-transparent blur-3xl animate-drift" />
                <div className="absolute -right-5 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/18 via-fuchsia-500/9 to-transparent blur-3xl animate-blob animation-delay-2000" />
              </div>
            )}
            <div
              className={cn(
                "relative rounded-xl px-4 py-3 sm:px-5 sm:py-4 backdrop-blur-sm transition-all duration-200 ease-out w-full min-w-0",
                isUser
                  ? "bg-gradient-to-br from-primary/15 to-primary/8 text-foreground shadow-sm border border-primary/30 hover:border-primary/50 hover:bg-primary/12"
                  : "bg-background/50 border border-border/20 shadow-xs hover:border-border/30 dark:bg-background/40",
              )}
            >
              <div
                className={cn(
                  "prose prose-sm w-full max-w-full min-w-0 overflow-hidden",
                  "prose-p:my-2 prose-p:leading-relaxed prose-p:break-words prose-p:overflow-wrap-anywhere",
                  "prose-headings:font-semibold prose-headings:break-words",
                  "prose-li:break-words prose-blockquote:break-words",
                  "prose-code:text-xs prose-code:break-all prose-code:whitespace-pre-wrap",
                  "prose-pre:max-w-full prose-pre:overflow-x-auto",
                  "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto",
                  "prose-a:break-all",
                  isUser ? "prose-invert" : "dark:prose-invert",
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props) {
                      const { children, className, ...rest } = props;
                      const match = /language-(\w+)/.exec(className || "");
                      const codeContent = String(children).replace(/\n$/, "");
                      const isInline = !match && !className;

                      if (!isInline && match) {
                        return (
                          <div className="my-4 w-full max-w-full overflow-hidden rounded-xl border border-border/30 bg-background/95 backdrop-blur-xl shadow-lg">
                            <div className="flex items-center justify-between border-b border-border/60 bg-background/60 px-4 py-2.5 backdrop-blur-xl">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {match[1]}
                              </span>
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(codeContent)
                                }
                                className="rounded-xl border border-primary/40 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-background hover:shadow-md hover:border-primary/60"
                              >
                                Copy
                              </button>
                            </div>
                            <div className="overflow-x-auto w-full">
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="!m-0 !rounded-none !bg-background/40 !w-full !min-w-max"
                                wrapLines={false}
                                wrapLongLines={false}
                              >
                                {codeContent}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <code
                          className={cn(
                            "inline-block max-w-full rounded-xl px-1.5 py-0.5 [overflow-wrap:anywhere] [word-break:break-all]",
                            isUser ? "bg-white/20" : "bg-primary/10",
                          )}
                          {...rest}
                        >
                          {children}
                        </code>
                      );
                    },
                    p({ children }) {
                      return (
                        <p className="w-full overflow-hidden [overflow-wrap:anywhere] [word-break:break-word]">
                          {children}
                        </p>
                      );
                    },
                    a({ children, href }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "inline-block max-w-full break-all font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline",
                            isUser ? "text-white" : "text-primary",
                          )}
                        >
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 px-2 min-w-0 flex-wrap ${isUser ? "justify-end" : "justify-start"}`}
          >
            <span className="text-[10px] font-medium text-muted-foreground shrink-0">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {message.sources?.length ? (
              <div className="flex gap-1.5 flex-wrap min-w-0">
                {message.sources.map((source, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      setViewingSource({
                        url: source.url,
                        usedChunks: source.used_chunks.map(
                          (chunk) => chunk.index,
                        ),
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-background/70 backdrop-blur-xl px-2.5 py-1 text-[10px] font-semibold text-foreground transition-all hover:border-primary/60 hover:bg-background hover:shadow-lg hover:shadow-primary/10 shrink-0"
                  >
                    <FileText className="h-3 w-3" />
                    Source {idx + 1}
                  </button>
                ))}
              </div>
            ) : null}
            {!isUser && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(message.content, message.id)}
                  className="h-7 rounded-xl border border-primary/40 bg-background/70 backdrop-blur-xl px-3 text-[10px] font-semibold hover:bg-background hover:shadow-lg transition-all hover:border-primary/60"
                >
                  {copiedMessageId === message.id ? (
                    <>
                      <Check className="mr-1.5 h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFocusedResponse(message);
                    setIsFocusedResponseFullscreen(false);
                  }}
                  className="h-7 rounded-xl border border-primary/40 bg-background/70 backdrop-blur-xl px-3 text-[10px] font-semibold hover:bg-background hover:shadow-lg transition-all hover:border-primary/60"
                  title="Open in focused view"
                  aria-label="Open response in focused viewer"
                >
                  <Maximize2 className="mr-1.5 h-3 w-3" />
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openRepromptDialog(message)}
                  disabled={isProcessing || isOffline}
                  className="h-7 rounded-xl border border-primary/40 bg-background/70 backdrop-blur-xl px-2.5 text-[10px] font-semibold hover:bg-background hover:shadow-lg transition-all hover:border-primary/60"
                  title="Retry with instructions"
                  aria-label="Retry this response with refinement instructions"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-transparent text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-[-10rem] h-96 w-96 rounded-full bg-gradient-to-br from-primary/25 via-primary/15 to-transparent blur-3xl animate-drift" />
        <div className="absolute top-16 right-[-9rem] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-fuchsia-500/20 via-fuchsia-500/10 to-transparent blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-cyan-400/15 via-cyan-400/8 to-transparent blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute top-1/2 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-primary/12 via-primary/6 to-transparent blur-3xl animate-drift animation-delay-2000" />
      </div>

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-col gap-4 p-3 sm:p-4 lg:p-5">
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border-2 border-border/30 bg-background/60 px-4 py-3 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {isOffline && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 backdrop-blur-sm">
                <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Offline
                </span>
              </div>
            )}
            <Logo size={28} />
            <div className="min-w-0 leading-none">
              <div className="truncate text-base font-black tracking-tight sm:text-lg">
                Cogent-x
              </div>
              <div className="truncate text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Workspace
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            <ModernSettingsPanel noSidebar initialSection="providers">
              <Button
                variant="outline"
                className="h-10 rounded-xl border-primary/40 bg-background/40 px-3 hover:border-primary/60 hover:bg-background/70 sm:px-3"
                title={`Active model: ${activeProvider.label}`}
                aria-label={`Open provider settings for ${activeProvider.label}`}
              >
                <activeProvider.icon className="mr-0 h-4 w-4 sm:mr-2" />
                <span className="hidden truncate text-sm font-semibold sm:inline">
                  {activeProvider.label}
                </span>
              </Button>
            </ModernSettingsPanel>
            <ModernSettingsPanel noSidebar initialSection="tune">
              <Button
                variant="outline"
                className="h-10 w-10 rounded-xl border-primary/40 bg-background/40 p-0 hover:border-primary/60 hover:bg-background/70"
                title="Tuning"
                aria-label="Tuning"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </ModernSettingsPanel>
            <ModernSettingsPanel
              noSidebar
              initialSection="ingest"
              disabled={isOffline}
            >
              <Button
                variant="outline"
                className="h-10 rounded-xl border-primary/40 bg-background/40 px-3 hover:border-primary/60 hover:bg-background/70 sm:px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isOffline}
              >
                <Upload className="mr-0 h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Ingest</span>
              </Button>
            </ModernSettingsPanel>
            <ModernSettingsPanel noSidebar initialSection="overview">
              <Button
                variant="outline"
                className="h-10 w-10 rounded-xl border-primary/40 bg-background/40 p-0 hover:border-primary/60 hover:bg-background/70"
                title="Open control center"
                aria-label="Open control center"
              >
                <Activity className="h-4 w-4" />
              </Button>
            </ModernSettingsPanel>
            <Button
              variant="outline"
              onClick={() => setTheme(darkMode ? "light" : "dark")}
              className="h-10 w-10 rounded-xl border-primary/40 bg-background/40 p-0 hover:border-primary/60 hover:bg-background/70"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {darkMode ? (
                <SunMedium className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[17rem_minmax(0,1fr)]">
          <SidePanel
            histories={histories}
            onSelectConversation={(c) => selectConversation(c as ChatConversation)}
            onDeleteConversation={deleteConversation}
            startNewChat={startNewChat}
          />

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1rem] border-2 border-border/30">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
              <div className="flex min-h-0 flex-1 flex-col gap-6">
                <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  {messages.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto">
                      <div className="w-full max-w-5xl space-y-6 pt-4 px-2 sm:px-4 lg:px-6">
                        {!isConfigured && (
                          <div className="rounded-3xl border border-primary/20 bg-background/45 px-4 py-3 text-sm text-muted-foreground backdrop-blur-2xl">
                            Set up a provider in the header to enable chat.
                          </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-3">
                          {prompts.slice(0, 3).map((prompt) => (
                            <button
                              key={prompt}
                              onClick={(event) =>
                                handleQuerySubmission(event, prompt)
                              }
                              className="group relative rounded-2xl border border-border/50 bg-background/50 p-4 text-left backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background/80 hover:shadow-lg hover:shadow-primary/10"
                            >
                              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary transition-transform group-hover:scale-110">
                                <Sparkles className="h-4 w-4" />
                              </div>
                              <p className="text-sm font-medium leading-snug text-foreground/80 group-hover:text-foreground">
                                {prompt}
                              </p>
                              <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary/60 group-hover:text-primary">
                                <span>Ask this</span>
                                <ChevronRight className="h-3 w-3" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 pb-4 pr-1 w-full px-2">
                      {messages.map(renderMessage)}

                      {isProcessing && (
                            <div className="flex items-start gap-4 animate-in fade-in-50 duration-300">
                              <div className="flex max-w-[65%] flex-col gap-2">
                                <div className="relative">
                                  <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                                    <div className="absolute -left-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent blur-2xl animate-drift" />
                                    <div className="absolute -right-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/15 via-fuchsia-500/8 to-transparent blur-2xl animate-blob animation-delay-2000" />
                                  </div>
                                  <div className="relative rounded-2xl border border-border/30 bg-gradient-to-b from-background/60 via-background/40 to-background/60 px-4 py-3 backdrop-blur-2xl shadow-md">
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-medium italic text-muted-foreground">
                                        Thinking
                                      </span>
                                      <div className="flex gap-1.5">
                                        <span
                                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gradient-to-br from-primary to-fuchsia-500 shadow-md shadow-primary/40"
                                        />
                                        <span
                                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gradient-to-br from-primary to-fuchsia-500 shadow-md shadow-primary/40 animation-delay-150"
                                        />
                                        <span
                                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gradient-to-br from-primary to-fuchsia-500 shadow-md shadow-primary/40 animation-delay-300"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                      <div ref={scrollRef} />
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="shrink-0 p-3 sm:p-4">
              <form
                onSubmit={handleQuerySubmission}
                className="relative space-y-2"
              >
                {availableDocuments.length > 0 && (
                  <div className="flex items-center gap-2 px-1">
                    <DocumentSelector
                      availableDocuments={availableDocuments}
                      selectedDocuments={selectedDocuments}
                      onSelectionChange={setSelectedDocuments}
                      disabled={isProcessing}
                    />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
                  <div className="absolute -left-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/15 via-primary/8 to-transparent blur-3xl animate-drift" />
                  <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-gradient-to-br from-fuchsia-500/12 via-fuchsia-500/6 to-transparent blur-3xl animate-blob animation-delay-2000" />
                  <div className="absolute left-1/2 -top-6 h-20 w-20 -translate-x-1/2 rounded-full bg-gradient-to-br from-cyan-400/10 via-cyan-400/5 to-transparent blur-3xl animate-blob animation-delay-4000" />
                </div>
                <div className="relative rounded-[1rem] border border-border/40 bg-gradient-to-b from-background/60 via-background/40 to-background/60 p-2.5 shadow-lg shadow-primary/8 backdrop-blur-3xl transition-all duration-300 focus-within:shadow-xl focus-within:shadow-primary/30 focus-within:border-primary/60 animate-neon-glow">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={startNewChat}
                      size="icon"
                      variant="ghost"
                      className="lg:hidden h-10 w-10 shrink-0 rounded-full border border-border/40 bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-background/70"
                      title="New conversation"
                      aria-label="New conversation"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Input
                      value={currentQuery}
                      onChange={(event) => setCurrentQuery(event.target.value)}
                      placeholder={
                        isOffline
                          ? "You're offline - messages will be saved locally"
                          : "Ask anything about your knowledge base..."
                      }
                      disabled={isProcessing || isOffline}
                      className="h-11 sm:h-12 min-w-0 flex-1 border-0 bg-transparent pl-4 pr-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                    />
                    <div className="flex items-center gap-1.5 pr-1">
                      <Button
                        type="submit"
                        disabled={
                          isProcessing || !currentQuery.trim() || isOffline
                        }
                        size="icon"
                        className="h-10 sm:h-11 w-10 sm:w-11 rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-md shadow-primary/40 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/50 disabled:scale-95 disabled:opacity-50 disabled:hover:scale-95 disabled:shadow-md active:scale-95"
                        title={
                          isOffline ? "Internet required to send messages" : ""
                        }
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <footer className="shrink-0 px-2 pb-2 sm:px-3 sm:pb-3">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/30 bg-background/35 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-2xl">
                <a
                  href="https://github.com/somritdasgupta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate font-medium hover:text-foreground"
                  aria-label="Open somritdasgupta GitHub profile"
                >
                  Developed by @somritdasgupta
                </a>
                <a
                  href="https://github.com/somritdasgupta/cogent-x"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-background/50 px-2.5 py-1 font-semibold text-foreground hover:border-primary/60 hover:bg-background/80"
                  aria-label="Open source repository on GitHub"
                >
                  <SiGithub className="h-3.5 w-3.5" />
                  /cogent-x
                </a>
                <a
                  href="https://linkedin.com/in/somritdasgupta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/30 bg-background/45 px-2.5 py-1 font-semibold text-foreground hover:border-primary/50 hover:bg-background/75"
                  aria-label="Open LinkedIn profile"
                >
                  <Linkedin className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              </div>
            </footer>
          </main>
        </div>
      </div>

      <Dialog
        open={!!focusedResponse}
        onOpenChange={(open) => {
          if (!open) {
            setFocusedResponse(null);
            setIsFocusedResponseFullscreen(false);
          }
        }}
      >
        <DialogContent
          hideCloseButton
          className={cn(
            "flex flex-col gap-0 overflow-hidden border-primary/30 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl",
            isFocusedResponseFullscreen
              ? "h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none sm:rounded-none"
              : "h-[88dvh] w-[94vw] max-w-5xl sm:rounded-xl",
          )}
        >
          <DialogHeader className="border-b border-border/30 px-4 py-4 text-left sm:px-6">
            <DialogTitle className="sr-only">Response viewer</DialogTitle>
            <DialogDescription className="sr-only">
              Focused view of one response and its original prompt.
            </DialogDescription>
            <div className="flex flex-col gap-3">
              <div className="min-w-0 flex-1 rounded-xl border border-primary/25 bg-primary/8 p-3 sm:p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    <span>Prompt</span>
                    {focusedResponse && (
                      <span className="text-muted-foreground">
                        {new Date(focusedResponse.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {focusedResponse && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const md = focusedResponse.content;
                            const prompt = focusedResponsePrompt;
                            const ts = new Date(focusedResponse.timestamp).toLocaleString();
                            const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print — Cogent-x</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#fff;color:#1a1a2e;font-size:11pt;line-height:1.7}@page{size:A4;margin:18mm 20mm 22mm 20mm}.header{border-bottom:2pt solid #7c3aed;padding-bottom:10pt;margin-bottom:16pt;display:flex;align-items:center;justify-content:space-between}.brand{font-size:9pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#7c3aed}.ts{font-size:8pt;color:#9ca3af}.prompt-card{background:#f8f6ff;border:1.5pt solid #c4b5fd;border-radius:8pt;padding:14pt 16pt;margin-bottom:18pt}.prompt-label{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#5b21b6;margin-bottom:8pt}.prompt-text{font-size:15pt;font-weight:700;line-height:1.3;color:#1a1a2e;font-family:Georgia,serif}.response{border:1pt solid #e5e7eb;border-radius:6pt;padding:16pt 18pt}.prose{color:#1f2937;font-size:10.5pt;line-height:1.75;font-family:Georgia,serif}.prose h1{font-size:16pt;font-family:Inter,sans-serif;border-bottom:1pt solid #e5e7eb;padding-bottom:4pt;margin:0 0 10pt}.prose h2{font-size:13pt;font-family:Inter,sans-serif;margin:16pt 0 6pt}.prose h3{font-size:11.5pt;font-family:Inter,sans-serif;margin:12pt 0 4pt}.prose p{margin:.6em 0;orphans:3;widows:3}.prose ul,.prose ol{padding-left:18pt;margin:.5em 0}.prose li{margin:.25em 0}.prose code{background:#f3f0ff;border:1pt solid #ddd6fe;color:#5b21b6;font-size:8.5pt;padding:1pt 4pt;border-radius:3pt;font-family:'Courier New',monospace}.prose pre{background:#f8f8f8;border:1pt solid #e5e7eb;border-radius:5pt;padding:10pt 12pt;page-break-inside:avoid;white-space:pre-wrap;word-break:break-all;margin:10pt 0}.prose pre code{background:none;border:none;color:#1f2937;font-size:8pt}.prose blockquote{border-left:3pt solid #7c3aed;padding-left:12pt;color:#4b5563;font-style:italic;margin:8pt 0}.prose a{color:#5b21b6;text-decoration:underline}.prose a::after{content:" (" attr(href) ")";font-size:7.5pt;color:#9ca3af}.prose table{border-collapse:collapse;width:100%;font-size:9pt;page-break-inside:avoid;margin:8pt 0}.prose th,.prose td{border:1pt solid #d1d5db;padding:5pt 8pt}.prose th{background:#f3f0ff;font-weight:700}.prose tr:nth-child(even) td{background:#fafafa}.prose strong{color:#111827}.prose hr{border-top:1pt solid #e5e7eb;margin:12pt 0}.footer{margin-top:24pt;padding-top:8pt;border-top:1pt solid #e5e7eb;font-size:8pt;color:#9ca3af;text-align:center}</style><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script></head><body><div class="header"><span class="brand">&#10022; Cogent-x</span><span class="ts">${escapeHtml(ts)}</span></div><div class="prompt-card"><div class="prompt-label">Prompt</div><div class="prompt-text">${escapeHtml(prompt || 'Assistant response')}</div></div><div class="response"><div class="prose" id="md"></div></div><div class="footer">Generated by Cogent-x &mdash; ${escapeHtml(ts)}</div><script>document.getElementById('md').innerHTML=marked.parse(${JSON.stringify(md)});window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})<` + `</script></body></html>`;
                            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
                            const w = window.open(url, '_blank', 'noopener,noreferrer');
                            if (w) { w.focus(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
                          }}
                          title="Print / Save as PDF"
                          className="h-7 rounded-lg border-primary/40 bg-background/60 px-2.5 text-[10px] font-semibold hover:border-primary/60 transition-all"
                          aria-label="Print response"
                        >
                          <Printer className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setIsFocusedResponseFullscreen((current) => !current)
                      }
                      className="h-7 w-7 rounded-lg border-primary/40 bg-background/60 hover:border-primary/60"
                      aria-label={
                        isFocusedResponseFullscreen
                          ? "Exit full screen"
                          : "View full screen"
                      }
                    >
                      {isFocusedResponseFullscreen ? (
                        <Minimize2 className="h-3 w-3" />
                      ) : (
                        <Maximize2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-foreground [overflow-wrap:anywhere] sm:max-h-40 sm:text-base">
                  {focusedResponsePrompt || "Assistant response"}
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="prose prose-sm max-w-none break-words [overflow-wrap:anywhere] dark:prose-invert sm:prose-base">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {focusedResponse?.content || ""}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!repromptTarget}
        onOpenChange={(open) => {
          if (!open && !isReprompting) {
            setRepromptTarget(null);
            setRepromptDetails("");
          }
        }}
      >
        <DialogContent className="max-w-2xl border-primary/30 bg-background/95 shadow-2xl backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>Retry this response</DialogTitle>
            <DialogDescription>
              Add what should change. Cogent-x will resend the original prompt
              with your refinement notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={repromptDetails}
              onChange={(event) => setRepromptDetails(event.target.value)}
              placeholder="Example: make it shorter, include code, use a more formal tone, explain the tradeoffs, cite the source chunks..."
              className="min-h-[140px] resize-y rounded-xl border-border/40 bg-background/50"
              disabled={isReprompting}
            />
            {repromptTarget && (
              <div className="rounded-xl border border-border/30 bg-background/45 p-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">
                  Original prompt
                </div>
                <p className="mt-1 line-clamp-3 break-words">
                  {repromptTarget.originalPrompt}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRepromptTarget(null);
                setRepromptDetails("");
              }}
              disabled={isReprompting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRepromptSubmit}
              disabled={isReprompting || !repromptDetails.trim()}
            >
              {isReprompting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Retry response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SourceModal
        url={viewingSource?.url || null}
        usedChunks={viewingSource?.usedChunks || []}
        onClose={() => setViewingSource(null)}
      />
    </div>
  );
};

export default ModernWorkspace;