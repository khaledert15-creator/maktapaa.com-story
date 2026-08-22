export type WebsiteChatPageContext = {
  path: string;
  type: "home" | "catalog" | "product" | "cart" | "checkout" | "account" | "order" | "other";
  productId?: number;
  orderId?: number;
};

export type WebsiteChatMessage = {
  id: number;
  text: string;
  direction: "customer" | "agent" | "system";
  createdAt: string;
  senderName: string | null;
  attachments: { index: number; type: string; size: number | null; url: string }[];
};

export type WebsiteChatConfig = {
  enabled: boolean;
  title: string;
  greeting: string;
  offlineMessage: string;
  quickActions: string[];
  fallbackPollMs: number;
  attachmentMaxBytes: number;
};

export class WebsiteChatApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = "WebsiteChatApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
    throw new WebsiteChatApiError(body.error ?? "تعذر الاتصال بخدمة المحادثة", body.code ?? "CHAT_REQUEST_FAILED", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const websiteChatApi = {
  getConfig: () => request<WebsiteChatConfig>("/chat/config"),
  start: (context?: WebsiteChatPageContext) => request<{
    messages: WebsiteChatMessage[];
    unreadCount: number;
    availability: "online" | "offline";
  }>("/chat/session", { method: "POST", body: JSON.stringify({ context }) }),
  updateContext: (context?: WebsiteChatPageContext) => request<void>("/chat/context", { method: "POST", body: JSON.stringify({ context }) }),
  messages: (before?: number) => request<{ messages: WebsiteChatMessage[] }>(`/chat/messages${before ? `?before=${before}` : ""}`),
  send: (content: string) => request<{ message: WebsiteChatMessage }>("/chat/messages", { method: "POST", body: JSON.stringify({ content }) }),
  sendAttachment: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ message: WebsiteChatMessage }>("/chat/attachments", { method: "POST", body: form });
  },
  markRead: () => request<void>("/chat/read", { method: "POST", body: "{}" }),
  typing: (typing: boolean) => request<void>("/chat/typing", { method: "POST", body: JSON.stringify({ typing }) }),
};
