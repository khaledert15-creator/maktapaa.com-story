import WebSocket from "ws";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

type ChatwootRealtimeOptions = {
  pubsubToken: string;
  conversationId: number;
  signal: AbortSignal;
  onEvent: (event: { event: string; data: unknown }) => void;
  onStatus: (status: "connected" | "reconnecting" | "disconnected") => void;
};

function realtimeUrl(): string {
  if (config.CHATWOOT_REALTIME_URL) return config.CHATWOOT_REALTIME_URL;
  if (!config.CHATWOOT_BASE_URL) throw new Error("Chatwoot base URL is not configured");
  const url = new URL(config.CHATWOOT_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/cable";
  url.search = "";
  return url.toString();
}

function conversationMatches(data: unknown, conversationId: number, requireConversation: boolean): boolean {
  if (!data || typeof data !== "object") return !requireConversation;
  const record = data as Record<string, unknown>;
  const conversation = record.conversation;
  const candidate = record.conversation_id
    ?? record.conversationId
    ?? (conversation && typeof conversation === "object" ? (conversation as Record<string, unknown>).id : undefined);
  return candidate === undefined ? !requireConversation : Number(candidate) === conversationId;
}

export function subscribeToChatwootRealtime(options: ChatwootRealtimeOptions): () => void {
  let socket: WebSocket | null = null;
  let presenceTimer: NodeJS.Timeout | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectAttempt = 0;
  const identifier = JSON.stringify({ channel: "RoomChannel", pubsub_token: options.pubsubToken });

  const cleanupSocket = () => {
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    socket = null;
  };

  const send = (payload: Record<string, unknown>) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  const connect = () => {
    if (options.signal.aborted) return;
    options.onStatus("reconnecting");
    const origin = config.CHATWOOT_BASE_URL ? new URL(config.CHATWOOT_BASE_URL).origin : undefined;
    socket = new WebSocket(realtimeUrl(), "actioncable-v1-json", origin ? { headers: { Origin: origin } } : undefined);

    socket.on("message", raw => {
      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (envelope.type === "welcome") {
        send({ command: "subscribe", identifier });
        return;
      }
      if (envelope.type === "confirm_subscription") {
        reconnectAttempt = 0;
        options.onStatus("connected");
        send({ command: "message", identifier, data: JSON.stringify({ action: "update_presence" }) });
        presenceTimer = setInterval(() => {
          send({ command: "message", identifier, data: JSON.stringify({ action: "update_presence" }) });
        }, 60_000);
        return;
      }
      const roomMessage = envelope.message;
      if (!roomMessage || typeof roomMessage !== "object") return;
      const eventRecord = roomMessage as Record<string, unknown>;
      const event = typeof eventRecord.event === "string" ? eventRecord.event : "message";
      const data = eventRecord.data ?? eventRecord;
      const isConversationEvent = event.startsWith("message.")
        || event.startsWith("conversation.typing_")
        || event.startsWith("conversation.status_");
      if (conversationMatches(data, options.conversationId, isConversationEvent)) {
        options.onEvent({ event, data });
      }
    });

    socket.on("error", error => {
      logger.warn({ errorName: error.name }, "Website chat realtime connection error");
    });
    socket.on("close", () => {
      cleanupSocket();
      if (options.signal.aborted) {
        options.onStatus("disconnected");
        return;
      }
      options.onStatus("reconnecting");
      reconnectAttempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt, 5));
      reconnectTimer = setTimeout(connect, delay);
    });
  };

  const stop = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    cleanupSocket();
    options.onStatus("disconnected");
  };
  options.signal.addEventListener("abort", stop, { once: true });
  connect();
  return stop;
}
