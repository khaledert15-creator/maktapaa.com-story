import { createHmac } from "node:crypto";

export interface ChatwootContact {
  id: number;
  source_id: string;
  pubsub_token: string;
  name?: string;
  email?: string | null;
  phone_number?: string | null;
}

export interface ChatwootAttachment {
  id?: number;
  file_type?: string;
  data_url?: string;
  thumb_url?: string;
  file_size?: number;
  extension?: string;
}

export interface ChatwootMessage {
  id: number;
  content?: string | null;
  message_type: number | string;
  content_type?: string;
  created_at: number | string;
  conversation_id: number;
  attachments?: ChatwootAttachment[];
  sender?: { id?: number; name?: string; avatar_url?: string | null } | null;
}

export interface ChatwootConversation {
  id: number;
  uuid?: string;
  status?: string;
  messages?: ChatwootMessage[];
}

export interface ChatwootInbox {
  name?: string;
  working_hours_enabled?: boolean;
  out_of_office_message?: string;
  timezone?: string;
}

export class ChatwootRequestError extends Error {
  constructor(
    public readonly operation: string,
    public readonly status: number,
    public readonly responseCode: string,
  ) {
    super(`Chatwoot request failed: ${operation} (${status})`);
    this.name = "ChatwootRequestError";
  }
}

interface ChatwootClientConfig {
  baseUrl: string;
  inboxIdentifier: string;
  hmacToken?: string;
  timeoutMs: number;
}

type ContactInput = {
  identifier: string;
  name: string;
  email?: string | null;
  phoneNumber?: string | null;
  customAttributes?: Record<string, unknown>;
};

export class ChatwootClient {
  private readonly publicBaseUrl: string;

  constructor(private readonly clientConfig: ChatwootClientConfig) {
    this.publicBaseUrl = `${clientConfig.baseUrl.replace(/\/$/, "")}/public/api/v1/inboxes/${encodeURIComponent(clientConfig.inboxIdentifier)}`;
  }

  identifierHash(identifier: string): string | undefined {
    return this.clientConfig.hmacToken
      ? createHmac("sha256", this.clientConfig.hmacToken).update(identifier).digest("hex")
      : undefined;
  }

  async createContact(input: ContactInput): Promise<ChatwootContact> {
    return this.request("create_contact", "/contacts", {
      method: "POST",
      json: {
        identifier: input.identifier,
        identifier_hash: this.identifierHash(input.identifier),
        name: input.name,
        email: input.email || undefined,
        phone_number: input.phoneNumber || undefined,
        custom_attributes: input.customAttributes,
      },
    });
  }

  async updateContact(sourceId: string, identifier: string, input: Omit<ContactInput, "identifier">): Promise<ChatwootContact> {
    return this.request("update_contact", `/contacts/${encodeURIComponent(sourceId)}`, {
      method: "PATCH",
      query: { identifier_hash: this.identifierHash(identifier) },
      json: {
        // Chatwoot validates identifier_hash against the identifier supplied
        // on contact updates. Omitting it makes Chatwoot 4.15 hash an empty
        // value and reject an otherwise valid server-side HMAC.
        identifier,
        name: input.name,
        email: input.email || undefined,
        phone_number: input.phoneNumber || undefined,
        custom_attributes: input.customAttributes,
      },
    });
  }

  async createConversation(sourceId: string): Promise<ChatwootConversation> {
    return this.request("create_conversation", `/contacts/${encodeURIComponent(sourceId)}/conversations`, { method: "POST", json: {} });
  }

  async listConversations(sourceId: string): Promise<ChatwootConversation[]> {
    const response = await this.request<ChatwootConversation[] | { payload?: ChatwootConversation[] }>(
      "list_conversations",
      `/contacts/${encodeURIComponent(sourceId)}/conversations`,
    );
    return Array.isArray(response) ? response : response.payload ?? [];
  }

  async getMessages(sourceId: string, conversationId: number, before?: number): Promise<ChatwootMessage[]> {
    const response = await this.request<ChatwootMessage[] | { payload?: ChatwootMessage[] }>(
      "list_messages",
      `/contacts/${encodeURIComponent(sourceId)}/conversations/${conversationId}/messages`,
      { query: { before } },
    );
    return Array.isArray(response) ? response : response.payload ?? [];
  }

  async sendMessage(sourceId: string, conversationId: number, content: string): Promise<ChatwootMessage> {
    return this.request("send_message", `/contacts/${encodeURIComponent(sourceId)}/conversations/${conversationId}/messages`, {
      method: "POST",
      json: { content },
    });
  }

  async sendAttachment(sourceId: string, conversationId: number, file: { buffer: Buffer; name: string; type: string }): Promise<ChatwootMessage> {
    const form = new FormData();
    form.append("content", "");
    form.append("attachments[]", new Blob([Uint8Array.from(file.buffer)], { type: file.type }), file.name);
    return this.request("send_attachment", `/contacts/${encodeURIComponent(sourceId)}/conversations/${conversationId}/messages`, {
      method: "POST",
      body: form,
    });
  }

  async toggleTyping(sourceId: string, conversationId: number, typing: boolean): Promise<void> {
    await this.request("toggle_typing", `/contacts/${encodeURIComponent(sourceId)}/conversations/${conversationId}/toggle_typing`, {
      method: "POST",
      json: { typing_status: typing ? "on" : "off" },
    });
  }

  async updateLastSeen(sourceId: string, conversationId: number): Promise<void> {
    await this.request("update_last_seen", `/contacts/${encodeURIComponent(sourceId)}/conversations/${conversationId}/update_last_seen`, {
      method: "POST",
      json: {},
    });
  }

  async getInbox(): Promise<ChatwootInbox> {
    return this.request("get_inbox", "");
  }

  private async request<T>(
    operation: string,
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | undefined>;
      json?: Record<string, unknown>;
      body?: FormData | string;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.publicBaseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ Accept: "application/json" });
    let body = options.body;
    if (options.json) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.json);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: AbortSignal.timeout(this.clientConfig.timeoutMs),
      });
    } catch {
      throw new ChatwootRequestError(operation, 503, "CHATWOOT_UNREACHABLE");
    }
    if (!response.ok) {
      throw new ChatwootRequestError(operation, response.status, "CHATWOOT_HTTP_ERROR");
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
