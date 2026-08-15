import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  WebsiteChatApiError,
  websiteChatApi,
  type WebsiteChatConfig,
  type WebsiteChatMessage,
  type WebsiteChatPageContext,
} from "@/lib/website-chat";

type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

type WebsiteChatContextValue = {
  enabled: boolean;
  config: WebsiteChatConfig | null;
  isOpen: boolean;
  loading: boolean;
  sending: boolean;
  loadingHistory: boolean;
  status: ConnectionStatus;
  messages: WebsiteChatMessage[];
  unreadCount: number;
  agentTyping: boolean;
  agentAvailable: boolean | null;
  error: string | null;
  openChat: (context?: WebsiteChatPageContext) => void;
  closeChat: () => void;
  setPageContext: (context?: WebsiteChatPageContext) => void;
  sendMessage: (content: string) => Promise<boolean>;
  sendAttachment: (file: File) => Promise<boolean>;
  loadHistory: () => Promise<void>;
  notifyTyping: (typing: boolean) => void;
  retry: () => void;
};

const WebsiteChatContext = createContext<WebsiteChatContextValue | null>(null);

function defaultContext(path: string): WebsiteChatPageContext {
  if (path === "/") return { path, type: "home" };
  if (path.startsWith("/catalog") || path.startsWith("/search")) return { path, type: "catalog" };
  if (path.startsWith("/cart")) return { path, type: "cart" };
  if (path.startsWith("/checkout")) return { path, type: "checkout" };
  if (path.startsWith("/account")) return { path, type: "account" };
  return { path, type: "other" };
}

function mergeMessages(current: WebsiteChatMessage[], additions: WebsiteChatMessage[]): WebsiteChatMessage[] {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of additions) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function WebsiteChatProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [config, setConfig] = useState<WebsiteChatConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [messages, setMessages] = useState<WebsiteChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageContext, setPageContextState] = useState<WebsiteChatPageContext>(() => defaultContext(location));
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isOpenRef = useRef(false);
  const startedRef = useRef(false);
  const pageContextRef = useRef(pageContext);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { startedRef.current = started; }, [started]);
  useEffect(() => { pageContextRef.current = pageContext; }, [pageContext]);

  useEffect(() => {
    let active = true;
    websiteChatApi.getConfig()
      .then(value => { if (active) setConfig(value); })
      .catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (location.startsWith("/admin")) return;
    const next = defaultContext(location);
    setPageContextState(next);
    if (startedRef.current) websiteChatApi.updateContext(next).catch(() => undefined);
  }, [location]);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    if (!config || pollTimerRef.current !== null) return;
    pollTimerRef.current = window.setInterval(() => {
      websiteChatApi.messages().then(result => {
        setMessages(current => {
          const knownIds = new Set(current.map(message => message.id));
          const newAgentMessages = result.messages.filter(message => message.direction === "agent" && !knownIds.has(message.id));
          if (!isOpenRef.current && newAgentMessages.length) setUnreadCount(count => count + newAgentMessages.length);
          return mergeMessages(current, result.messages);
        });
      }).catch(() => undefined);
    }, config.fallbackPollMs);
  }, [config]);

  const connectRealtime = useCallback(() => {
    eventSourceRef.current?.close();
    clearPolling();
    const source = new EventSource("/api/chat/events", { withCredentials: true });
    eventSourceRef.current = source;
    setStatus("connecting");
    source.addEventListener("status", event => {
      const payload = JSON.parse((event as MessageEvent).data) as { status?: ConnectionStatus };
      setStatus(payload.status === "connected" ? "connected" : "reconnecting");
      if (payload.status === "connected") clearPolling();
      else startPolling();
    });
    source.addEventListener("message", event => {
      const message = JSON.parse((event as MessageEvent).data) as WebsiteChatMessage;
      setMessages(current => mergeMessages(current, [message]));
      if (message.direction === "agent") {
        if (isOpenRef.current) websiteChatApi.markRead().catch(() => undefined);
        else setUnreadCount(count => count + 1);
      }
    });
    source.addEventListener("typing", () => {
      setAgentTyping(true);
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setAgentTyping(false), 4_000);
    });
    source.addEventListener("availability", event => {
      const payload = JSON.parse((event as MessageEvent).data) as { users?: Record<string, string> };
      if (!payload.users || typeof payload.users !== "object") return;
      setAgentAvailable(Object.values(payload.users).some(value => value === "online" || value === "busy"));
    });
    source.onerror = () => {
      setStatus(navigator.onLine ? "reconnecting" : "offline");
      startPolling();
    };
  }, [clearPolling, startPolling]);

  const bootstrap = useCallback(async (context?: WebsiteChatPageContext) => {
    if (!config?.enabled || loading) return;
    setLoading(true);
    setError(null);
    setStatus("connecting");
    try {
      const result = await websiteChatApi.start(context ?? pageContextRef.current);
      setMessages(result.messages);
      setUnreadCount(result.unreadCount);
      setStarted(true);
      connectRealtime();
    } catch (requestError) {
      const message = requestError instanceof WebsiteChatApiError ? requestError.message : "تعذر فتح المحادثة الآن";
      setError(message);
      setStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [config?.enabled, connectRealtime, loading]);

  const openChat = useCallback((context?: WebsiteChatPageContext) => {
    if (context) {
      pageContextRef.current = context;
      setPageContextState(context);
    }
    setIsOpen(true);
    setUnreadCount(0);
    if (!started) void bootstrap(context);
    else {
      websiteChatApi.markRead().catch(() => undefined);
      if (context) websiteChatApi.updateContext(context).catch(() => undefined);
    }
  }, [bootstrap, started]);

  const closeChat = useCallback(() => setIsOpen(false), []);
  const setPageContext = useCallback((context?: WebsiteChatPageContext) => {
    const next = context ?? defaultContext(location);
    pageContextRef.current = next;
    setPageContextState(next);
    if (started) websiteChatApi.updateContext(next).catch(() => undefined);
  }, [location, started]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || sending) return false;
    setSending(true);
    setError(null);
    try {
      const result = await websiteChatApi.send(content.trim());
      setMessages(current => mergeMessages(current, [result.message]));
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذر إرسال الرسالة");
      return false;
    } finally { setSending(false); }
  }, [sending]);

  const sendAttachment = useCallback(async (file: File) => {
    if (!config || file.size > config.attachmentMaxBytes || sending) {
      setError(file.size > (config?.attachmentMaxBytes ?? 0) ? "حجم الملف أكبر من الحد المسموح" : "تعذر إرسال الملف");
      return false;
    }
    setSending(true);
    setError(null);
    try {
      const result = await websiteChatApi.sendAttachment(file);
      setMessages(current => mergeMessages(current, [result.message]));
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذر إرسال الملف");
      return false;
    } finally { setSending(false); }
  }, [config, sending]);

  const loadHistory = useCallback(async () => {
    const first = messages[0];
    if (!first || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const result = await websiteChatApi.messages(first.id);
      setMessages(current => mergeMessages(current, result.messages));
    } finally { setLoadingHistory(false); }
  }, [loadingHistory, messages]);

  const notifyTyping = useCallback((typing: boolean) => {
    if (started) websiteChatApi.typing(typing).catch(() => undefined);
  }, [started]);

  const retry = useCallback(() => { void bootstrap(pageContextRef.current); }, [bootstrap]);

  useEffect(() => () => {
    eventSourceRef.current?.close();
    clearPolling();
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
  }, [clearPolling]);

  const value = useMemo<WebsiteChatContextValue>(() => ({
    enabled: Boolean(config?.enabled) && !location.startsWith("/admin"), config, isOpen, loading, sending,
    loadingHistory, status, messages, unreadCount, agentTyping, agentAvailable, error, openChat, closeChat, setPageContext,
    sendMessage, sendAttachment, loadHistory, notifyTyping, retry,
  }), [agentAvailable, agentTyping, closeChat, config, error, isOpen, loadHistory, loading, loadingHistory, location, messages, notifyTyping, openChat, retry, sendAttachment, sendMessage, sending, setPageContext, status, unreadCount]);

  return <WebsiteChatContext.Provider value={value}>{children}</WebsiteChatContext.Provider>;
}

export function useWebsiteChat() {
  const value = useContext(WebsiteChatContext);
  if (!value) throw new Error("useWebsiteChat must be used within WebsiteChatProvider");
  return value;
}
