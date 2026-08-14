import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { Server as ApiServer } from "node:http";

let mockChatwoot: Server;
let apiServer: ApiServer;
let baseUrl = "";
let dbModule: typeof import("@workspace/db");
const testStartedAt = new Date();
const contacts = new Map<string, { id: number; sourceId: string; pubsubToken: string; conversationId: number }>();
const messages = new Map<string, { id: number; content: string; message_type: number; created_at: number; conversation_id: number }[]>();
let contactSequence = 0;
let messageSequence = 1000;
let rejectContactCreation = false;
let rejectedContactRequests = 0;

function json(res: import("node:http").ServerResponse, value: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

before(async () => {
  mockChatwoot = createServer((req, res) => {
    const bodyChunks: Buffer[] = [];
    req.on("data", chunk => bodyChunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://chatwoot.test");
      const body = Buffer.concat(bodyChunks).toString("utf8");
      const contactMatch = url.pathname.match(/\/contacts\/([^/]+)/);
      const sourceId = contactMatch ? decodeURIComponent(contactMatch[1]) : null;
      if (url.pathname.endsWith("/contacts") && req.method === "POST") {
        if (rejectContactCreation) {
          rejectedContactRequests += 1;
          json(res, { error: "temporary failure" }, 502);
          return;
        }
        const payload = JSON.parse(body) as { identifier: string };
        let contact = contacts.get(payload.identifier);
        if (!contact) {
          contactSequence += 1;
          contact = { id: contactSequence, sourceId: `source-${contactSequence}`, pubsubToken: `pubsub-${contactSequence}`, conversationId: 2000 + contactSequence };
          contacts.set(payload.identifier, contact);
          messages.set(contact.sourceId, []);
        }
        json(res, { id: contact.id, source_id: contact.sourceId, pubsub_token: contact.pubsubToken });
        return;
      }
      if (sourceId && req.method === "PATCH" && url.pathname.endsWith(`/contacts/${sourceId}`)) {
        const contact = [...contacts.values()].find(item => item.sourceId === sourceId)!;
        json(res, { id: contact.id, source_id: sourceId, pubsub_token: contact.pubsubToken });
        return;
      }
      if (sourceId && url.pathname.endsWith("/conversations") && req.method === "GET") {
        const contact = [...contacts.values()].find(item => item.sourceId === sourceId)!;
        const hasConversation = (messages.get(sourceId) as Array<unknown> & { provisioned?: boolean }).provisioned;
        json(res, hasConversation ? [{ id: contact.conversationId, uuid: `uuid-${contact.conversationId}`, status: "open" }] : []);
        return;
      }
      if (sourceId && url.pathname.endsWith("/conversations") && req.method === "POST") {
        const contact = [...contacts.values()].find(item => item.sourceId === sourceId)!;
        (messages.get(sourceId) as Array<unknown> & { provisioned?: boolean }).provisioned = true;
        json(res, { id: contact.conversationId, uuid: `uuid-${contact.conversationId}`, status: "open" });
        return;
      }
      if (sourceId && url.pathname.endsWith("/messages") && req.method === "GET") {
        const all = messages.get(sourceId) ?? [];
        const beforeId = Number(url.searchParams.get("before") ?? 0);
        json(res, beforeId ? all.filter(item => item.id < beforeId) : all);
        return;
      }
      if (sourceId && url.pathname.endsWith("/messages") && req.method === "POST") {
        const contact = [...contacts.values()].find(item => item.sourceId === sourceId)!;
        const contentType = req.headers["content-type"] ?? "";
        const content = contentType.includes("application/json") ? (JSON.parse(body) as { content?: string }).content ?? "" : "";
        const message = { id: ++messageSequence, content, message_type: 0, created_at: Math.floor(Date.now() / 1000), conversation_id: contact.conversationId };
        messages.get(sourceId)!.push(message);
        json(res, message, 201);
        return;
      }
      if (sourceId && (url.pathname.endsWith("/toggle_typing") || url.pathname.endsWith("/update_last_seen"))) {
        json(res, { success: true });
        return;
      }
      json(res, { name: "Website Chat – Maktaba Dot Com", working_hours_enabled: false });
    });
  });
  mockChatwoot.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => mockChatwoot.once("listening", resolve));
  const mockAddress = mockChatwoot.address();
  if (!mockAddress || typeof mockAddress === "string") throw new Error("Mock Chatwoot did not start");

  process.env.WEBSITE_CHAT_ENABLED = "true";
  process.env.WEBSITE_CHAT_ENCRYPTION_KEY = "integration-website-chat-key-at-least-32-characters";
  process.env.CHATWOOT_BASE_URL = `http://127.0.0.1:${mockAddress.port}`;
  process.env.CHATWOOT_REALTIME_URL = `ws://127.0.0.1:${mockAddress.port}/cable`;
  process.env.CHATWOOT_API_INBOX_IDENTIFIER = "integration-inbox";
  process.env.CHATWOOT_HMAC_TOKEN = "integration-hmac-token-secret";
  process.env.CHATWOOT_REQUEST_TIMEOUT_MS = "2000";

  const [{ default: app }, database] = await Promise.all([import("../app"), import("@workspace/db")]);
  dbModule = database;
  apiServer = (app as Express).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => apiServer.once("listening", resolve));
  const apiAddress = apiServer.address();
  if (!apiAddress || typeof apiAddress === "string") throw new Error("API test server did not start");
  baseUrl = `http://127.0.0.1:${apiAddress.port}`;
});

after(async () => {
  const { db, websiteChatThreadsTable, customersTable, pool } = dbModule;
  const { gte, like } = await import("drizzle-orm");
  await db.delete(websiteChatThreadsTable).where(gte(websiteChatThreadsTable.createdAt, testStartedAt));
  await db.delete(customersTable).where(like(customersTable.email, "website-chat-%@example.test"));
  await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => mockChatwoot.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

async function request(path: string, cookie = "", init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  return { response, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? cookie };
}

test("custom chat HTTP workflow keeps guests isolated and preserves the thread after registration", async () => {
  const configResponse = await request("/api/chat/config");
  assert.equal(configResponse.response.status, 200);
  assert.equal((await configResponse.response.json() as { enabled: boolean }).enabled, true);

  const guestA = await request("/api/chat/session", "", { method: "POST", body: JSON.stringify({ context: { path: "/cart", type: "cart" } }) });
  assert.equal(guestA.response.status, 200);
  assert.ok(guestA.cookie);
  const sentA = await request("/api/chat/messages", guestA.cookie, { method: "POST", body: JSON.stringify({ content: "رسالة الضيف الأول" }) });
  assert.equal(sentA.response.status, 201);
  const messageA = (await sentA.response.json() as { message: { id: number; text: string } }).message;
  assert.equal(messageA.text, "رسالة الضيف الأول");

  const guestB = await request("/api/chat/session", "", { method: "POST", body: JSON.stringify({ context: { path: "/", type: "home" } }) });
  assert.equal(guestB.response.status, 200);
  assert.notEqual(guestA.cookie, guestB.cookie);
  const guestBMessages = await request(`/api/chat/messages?sourceId=source-1&conversationId=2001`, guestB.cookie);
  assert.equal(guestBMessages.response.status, 200);
  assert.deepEqual((await guestBMessages.response.json() as { messages: unknown[] }).messages, [], "client-supplied remote IDs cannot cross guest boundaries");

  const suffix = randomUUID();
  const registration = await request("/api/auth/register", guestA.cookie, {
    method: "POST",
    body: JSON.stringify({ name: "عميل الدردشة", mobile: `010${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`, email: `website-chat-${suffix}@example.test`, password: `Secure-${suffix}` }),
  });
  assert.equal(registration.response.status, 201);
  const afterLogin = await request("/api/chat/messages", registration.cookie);
  assert.equal(afterLogin.response.status, 200);
  assert.equal((await afterLogin.response.json() as { messages: { id: number }[] }).messages.some(item => item.id === messageA.id), true, "guest conversation survives session regeneration and account claim");

  const { db, websiteChatThreadsTable } = dbModule;
  const rows = await db.select().from(websiteChatThreadsTable);
  const testRows = rows.filter(row => row.createdAt >= testStartedAt);
  assert.equal(testRows.length, 2);
  assert.ok(testRows.some(row => row.customerId && row.guestKeyHash === null));
  assert.ok(testRows.every(row => !row.chatwootSourceIdEncrypted?.includes("source-")), "Chatwoot source IDs are encrypted in PostgreSQL");

  rejectContactCreation = true;
  const failedGuest = await request("/api/chat/session", "", { method: "POST", body: JSON.stringify({ context: { path: "/", type: "home" } }) });
  assert.equal(failedGuest.response.status, 503);
  const failedRows = (await db.select().from(websiteChatThreadsTable)).filter(row => row.createdAt >= testStartedAt && row.status === "failed");
  assert.equal(failedRows.length, 1, "provisioning failure is committed for retry cooldown and diagnostics");
  const retryDuringCooldown = await request("/api/chat/session", failedGuest.cookie, { method: "POST", body: JSON.stringify({ context: { path: "/", type: "home" } }) });
  assert.equal(retryDuringCooldown.response.status, 503);
  assert.equal(rejectedContactRequests, 1, "cooldown prevents repeatedly hammering an unavailable Chatwoot service");
  rejectContactCreation = false;
});
