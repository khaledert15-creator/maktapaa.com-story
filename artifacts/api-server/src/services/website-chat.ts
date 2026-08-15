import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { customersTable, db, websiteChatThreadsTable, type WebsiteChatThread } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { ChatwootClient, type ChatwootMessage } from "./chatwoot-client";
import { buildWebsiteChatContext, type WebsiteChatPageContext } from "./website-chat-context";
import {
  decryptWebsiteChatSecret,
  encryptWebsiteChatSecret,
  hashWebsiteChatGuestKey,
} from "./website-chat-secrets";

export class WebsiteChatUnavailableError extends Error {
  constructor(public readonly code = "CHAT_UNAVAILABLE") {
    super("خدمة المحادثة غير متاحة مؤقتًا");
    this.name = "WebsiteChatUnavailableError";
  }
}

export type WebsiteChatMessageDto = {
  id: number;
  text: string;
  direction: "customer" | "agent" | "system";
  createdAt: string;
  senderName: string | null;
  attachments: { index: number; type: string; size: number | null; url: string }[];
};

export interface ReadyWebsiteChatThread {
  row: WebsiteChatThread;
  sourceId: string;
  pubsubToken: string;
}

function getClient(): ChatwootClient {
  if (!config.websiteChatEnabled || !config.CHATWOOT_BASE_URL || !config.CHATWOOT_API_INBOX_IDENTIFIER) {
    throw new WebsiteChatUnavailableError("CHAT_DISABLED");
  }
  return new ChatwootClient({
    baseUrl: config.CHATWOOT_BASE_URL,
    inboxIdentifier: config.CHATWOOT_API_INBOX_IDENTIFIER,
    hmacToken: config.CHATWOOT_HMAC_TOKEN || undefined,
    timeoutMs: config.CHATWOOT_REQUEST_TIMEOUT_MS,
  });
}

function ensureGuestId(req: Request): string {
  if (!req.session.websiteChatGuestId) req.session.websiteChatGuestId = randomUUID();
  return req.session.websiteChatGuestId;
}

function remoteIdentifier(thread: WebsiteChatThread): string {
  return thread.customerId
    ? `maktaba_customer_${thread.customerId}`
    : `maktaba_guest_${thread.guestKeyHash?.slice(0, 24)}`;
}

async function findOrCreateOwnedThread(req: Request): Promise<WebsiteChatThread> {
  const guestKeyHash = hashWebsiteChatGuestKey(ensureGuestId(req));
  let customerId = req.session.customerId;
  if (customerId) {
    const [customer] = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, customerId));
    if (!customer) {
      delete req.session.customerId;
      delete req.session.customerName;
      customerId = undefined;
    }
  }
  if (customerId) {
    const [customerThread] = await db.select().from(websiteChatThreadsTable).where(eq(websiteChatThreadsTable.customerId, customerId));
    if (customerThread) return customerThread;

    const [guestThread] = await db.select().from(websiteChatThreadsTable).where(eq(websiteChatThreadsTable.guestKeyHash, guestKeyHash));
    if (guestThread) {
      try {
        const [claimed] = await db.update(websiteChatThreadsTable)
          .set({ customerId, guestKeyHash: null, updatedAt: new Date() })
          .where(and(eq(websiteChatThreadsTable.id, guestThread.id), isNull(websiteChatThreadsTable.customerId)))
          .returning();
        if (claimed) return claimed;
      } catch {
        const [winner] = await db.select().from(websiteChatThreadsTable).where(eq(websiteChatThreadsTable.customerId, customerId));
        if (winner) return winner;
        throw new WebsiteChatUnavailableError();
      }
    }

    await db.insert(websiteChatThreadsTable).values({ customerId }).onConflictDoNothing();
    const [created] = await db.select().from(websiteChatThreadsTable).where(eq(websiteChatThreadsTable.customerId, customerId));
    if (!created) throw new WebsiteChatUnavailableError();
    return created;
  }

  await db.insert(websiteChatThreadsTable).values({ guestKeyHash }).onConflictDoNothing();
  const [created] = await db.select().from(websiteChatThreadsTable).where(eq(websiteChatThreadsTable.guestKeyHash, guestKeyHash));
  if (!created) throw new WebsiteChatUnavailableError();
  return created;
}

function decryptReadyThread(row: WebsiteChatThread): ReadyWebsiteChatThread {
  if (
    row.status !== "ready" ||
    !row.chatwootSourceIdEncrypted ||
    !row.chatwootPubsubTokenEncrypted ||
    !row.chatwootConversationId ||
    !config.WEBSITE_CHAT_ENCRYPTION_KEY
  ) throw new WebsiteChatUnavailableError();
  try {
    return {
      row,
      sourceId: decryptWebsiteChatSecret(row.chatwootSourceIdEncrypted, config.WEBSITE_CHAT_ENCRYPTION_KEY),
      pubsubToken: decryptWebsiteChatSecret(row.chatwootPubsubTokenEncrypted, config.WEBSITE_CHAT_ENCRYPTION_KEY),
    };
  } catch {
    throw new WebsiteChatUnavailableError("CHAT_MAPPING_INVALID");
  }
}

async function provisionThread(req: Request, initial: WebsiteChatThread, page?: WebsiteChatPageContext): Promise<ReadyWebsiteChatThread> {
  const client = getClient();
  const context = await buildWebsiteChatContext(req, page);
  const encryptionSecret = config.WEBSITE_CHAT_ENCRYPTION_KEY;
  if (!encryptionSecret) throw new WebsiteChatUnavailableError("CHAT_DISABLED");

  const result = await db.transaction(async transaction => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${initial.id})`);
    const [thread] = await transaction.select().from(websiteChatThreadsTable).where(eq(websiteChatThreadsTable.id, initial.id));
    if (!thread) throw new WebsiteChatUnavailableError();
    if (thread.status === "ready") return { thread: decryptReadyThread(thread), failureCode: null };
    if (thread.status === "failed" && Date.now() - thread.updatedAt.getTime() < 30_000) {
      throw new WebsiteChatUnavailableError(thread.failureCode ?? "CHAT_PROVISIONING_FAILED");
    }

    try {
      const identifier = remoteIdentifier(thread);
      const contact = await client.createContact({
        identifier,
        ...context.identity,
        customAttributes: context.customAttributes,
      });
      const existingConversations = await client.listConversations(contact.source_id);
      const conversation = existingConversations.find(item => item.status !== "resolved")
        ?? existingConversations[0]
        ?? await client.createConversation(contact.source_id);
      const [updated] = await transaction.update(websiteChatThreadsTable).set({
        chatwootContactId: contact.id,
        chatwootSourceIdEncrypted: encryptWebsiteChatSecret(contact.source_id, encryptionSecret),
        chatwootPubsubTokenEncrypted: encryptWebsiteChatSecret(contact.pubsub_token, encryptionSecret),
        chatwootConversationId: conversation.id,
        chatwootConversationUuid: conversation.uuid ?? null,
        status: "ready",
        failureCode: null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(websiteChatThreadsTable.id, thread.id)).returning();
      return { thread: decryptReadyThread(updated), failureCode: null };
    } catch (error) {
      const code = error instanceof WebsiteChatUnavailableError ? error.code : "CHATWOOT_PROVISIONING_FAILED";
      await transaction.update(websiteChatThreadsTable).set({ status: "failed", failureCode: code, updatedAt: new Date() })
        .where(eq(websiteChatThreadsTable.id, thread.id));
      return { thread: null, failureCode: code };
    }
  });
  if (!result.thread) {
    logger.warn({ chatThreadId: initial.id, code: result.failureCode }, "Website chat provisioning failed");
    throw new WebsiteChatUnavailableError(result.failureCode ?? "CHATWOOT_PROVISIONING_FAILED");
  }
  return result.thread;
}

export async function resolveWebsiteChatThread(req: Request, page?: WebsiteChatPageContext): Promise<ReadyWebsiteChatThread> {
  const thread = await findOrCreateOwnedThread(req);
  return thread.status === "ready" ? decryptReadyThread(thread) : provisionThread(req, thread, page);
}

export async function updateWebsiteChatContext(req: Request, thread: ReadyWebsiteChatThread, page?: WebsiteChatPageContext): Promise<void> {
  const context = await buildWebsiteChatContext(req, page);
  await getClient().updateContact(thread.sourceId, remoteIdentifier(thread.row), {
    ...context.identity,
    customAttributes: context.customAttributes,
  });
  await db.update(websiteChatThreadsTable).set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(websiteChatThreadsTable.id, thread.row.id));
}

export function mapWebsiteChatMessage(message: ChatwootMessage): WebsiteChatMessageDto {
  const numericType = typeof message.message_type === "number" ? message.message_type : null;
  const direction = numericType === 0 || message.message_type === "incoming"
    ? "customer"
    : numericType === 1 || message.message_type === "outgoing"
      ? "agent"
      : "system";
  const rawCreatedAt = typeof message.created_at === "number"
    ? new Date(message.created_at * 1000)
    : new Date(message.created_at);
  return {
    id: message.id,
    text: String(message.content ?? ""),
    direction,
    createdAt: Number.isNaN(rawCreatedAt.getTime()) ? new Date().toISOString() : rawCreatedAt.toISOString(),
    senderName: direction === "agent" ? String(message.sender?.name ?? "فريق مكتبة دوت كوم") : null,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      index,
      type: String(attachment.file_type ?? attachment.extension ?? "file"),
      size: typeof attachment.file_size === "number" ? attachment.file_size : null,
      url: `/api/chat/attachments/${message.id}/${index}`,
    })),
  };
}

export async function listWebsiteChatMessages(thread: ReadyWebsiteChatThread, before?: number): Promise<WebsiteChatMessageDto[]> {
  const messages = await getClient().getMessages(thread.sourceId, thread.row.chatwootConversationId!, before);
  return messages.map(mapWebsiteChatMessage).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function sendWebsiteChatMessage(thread: ReadyWebsiteChatThread, content: string): Promise<WebsiteChatMessageDto> {
  return mapWebsiteChatMessage(await getClient().sendMessage(thread.sourceId, thread.row.chatwootConversationId!, content));
}

export async function sendWebsiteChatAttachment(
  thread: ReadyWebsiteChatThread,
  file: { buffer: Buffer; name: string; type: string },
): Promise<WebsiteChatMessageDto> {
  return mapWebsiteChatMessage(await getClient().sendAttachment(thread.sourceId, thread.row.chatwootConversationId!, file));
}

export async function setWebsiteChatTyping(thread: ReadyWebsiteChatThread, typing: boolean): Promise<void> {
  await getClient().toggleTyping(thread.sourceId, thread.row.chatwootConversationId!, typing);
}

export async function markWebsiteChatRead(thread: ReadyWebsiteChatThread): Promise<void> {
  await Promise.all([
    getClient().updateLastSeen(thread.sourceId, thread.row.chatwootConversationId!),
    db.update(websiteChatThreadsTable).set({ lastReadAt: new Date(), updatedAt: new Date() })
      .where(eq(websiteChatThreadsTable.id, thread.row.id)),
  ]);
}

export async function getWebsiteChatInbox() {
  return getClient().getInbox();
}

export async function getWebsiteChatAttachment(thread: ReadyWebsiteChatThread, messageId: number, index: number): Promise<string> {
  let before: number | undefined;
  let message: ChatwootMessage | undefined;
  for (let page = 0; page < 10 && !message; page += 1) {
    const messages = await getClient().getMessages(thread.sourceId, thread.row.chatwootConversationId!, before);
    message = messages.find(item => item.id === messageId);
    if (message || messages.length < 20) break;
    before = Math.min(...messages.map(item => item.id));
  }
  const attachment = message?.attachments?.[index];
  const url = attachment?.data_url ?? attachment?.thumb_url;
  if (!url) throw new WebsiteChatUnavailableError("CHAT_ATTACHMENT_NOT_FOUND");
  const parsed = new URL(url, config.CHATWOOT_BASE_URL);
  const chatwootOrigin = new URL(config.CHATWOOT_BASE_URL!).origin;
  if (parsed.origin !== chatwootOrigin) throw new WebsiteChatUnavailableError("CHAT_ATTACHMENT_ORIGIN_INVALID");
  return parsed.toString();
}
