import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { ChatwootClient } from "./chatwoot-client";
import { toChatwootE164 } from "./website-chat-context";
import {
  decryptWebsiteChatSecret,
  encryptWebsiteChatSecret,
  hashWebsiteChatGuestKey,
} from "./website-chat-secrets";

const secret = "website-chat-test-encryption-key-32-bytes-minimum";

test("website chat mapping secrets are encrypted at rest and reject tampering", () => {
  const encrypted = encryptWebsiteChatSecret("source-secret-value", secret);
  assert.notEqual(encrypted, "source-secret-value");
  assert.equal(decryptWebsiteChatSecret(encrypted, secret), "source-secret-value");
  const parts = encrypted.split(".");
  const tamperedTag = Buffer.from(parts[1], "base64url");
  tamperedTag[0] ^= 1;
  parts[1] = tamperedTag.toString("base64url");
  assert.throws(() => decryptWebsiteChatSecret(parts.join("."), secret));
  assert.notEqual(hashWebsiteChatGuestKey("guest-a"), hashWebsiteChatGuestKey("guest-b"));
});

test("Egyptian customer phones are converted to Chatwoot E.164 without forwarding invalid values", () => {
  assert.equal(toChatwootE164("01012345678"), "+201012345678");
  assert.equal(toChatwootE164("+20 10 1234 5678"), "+201012345678");
  assert.equal(toChatwootE164("123"), null);
  assert.equal(toChatwootE164(null), null);
});

let chatwootServer: Server;
let chatwootBaseUrl = "";
const requests: { method: string; path: string; body: string }[] = [];

before(async () => {
  chatwootServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "";
      requests.push({ method: req.method ?? "GET", path, body });
      res.setHeader("content-type", "application/json");
      if (path.endsWith("/contacts") && req.method === "POST") res.end(JSON.stringify({ id: 7, source_id: "source-7", pubsub_token: "pubsub-7" }));
      else if (path.includes("/conversations/42/messages") && req.method === "POST") res.end(JSON.stringify({ id: 101, content: body.includes("multipart/form-data") ? "" : "رسالة", message_type: 0, created_at: 1_700_000_000, conversation_id: 42, attachments: [] }));
      else if (path.includes("/conversations/42/messages")) res.end(JSON.stringify([{ id: 100, content: "رد الموظف", message_type: 1, created_at: 1_700_000_000, conversation_id: 42 }]));
      else if (path.endsWith("/conversations") && req.method === "POST") res.end(JSON.stringify({ id: 42, uuid: "conversation-42", status: "open" }));
      else if (path.endsWith("/conversations")) res.end(JSON.stringify([]));
      else if (path.includes("toggle_typing") || path.includes("update_last_seen")) res.end(JSON.stringify({ success: true }));
      else if (path.includes("/contacts/source-7") && req.method === "PATCH") res.end(JSON.stringify({ id: 7, source_id: "source-7", pubsub_token: "pubsub-7" }));
      else res.end(JSON.stringify({ name: "Website Chat – Maktaba Dot Com" }));
    });
  });
  chatwootServer.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => chatwootServer.once("listening", resolve));
  const address = chatwootServer.address();
  if (!address || typeof address === "string") throw new Error("Mock Chatwoot server did not start");
  chatwootBaseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>((resolve, reject) => chatwootServer.close(error => error ? reject(error) : resolve())));

test("Chatwoot client uses the official public API contract and server-side identifier HMAC", async () => {
  const hmacToken = "chatwoot-hmac-secret-for-tests";
  const client = new ChatwootClient({ baseUrl: chatwootBaseUrl, inboxIdentifier: "inbox-identifier", hmacToken, timeoutMs: 2_000 });
  const contact = await client.createContact({ identifier: "maktaba_guest_abc", name: "زائر", customAttributes: { website_path: "/product/test" } });
  assert.equal(contact.source_id, "source-7");
  const contactRequest = requests.find(item => item.path.endsWith("/contacts") && item.method === "POST");
  assert.ok(contactRequest);
  const contactBody = JSON.parse(contactRequest.body) as { identifier_hash: string; custom_attributes: { website_path: string } };
  assert.equal(contactBody.identifier_hash, createHmac("sha256", hmacToken).update("maktaba_guest_abc").digest("hex"));
  assert.equal(contactBody.custom_attributes.website_path, "/product/test");

  await client.updateContact(contact.source_id, "maktaba_guest_abc", {
    name: "زائر محدث",
    customAttributes: { website_path: "/cart" },
  });
  const updateRequest = requests.find(item => item.path.includes("/contacts/source-7?") && item.method === "PATCH");
  assert.ok(updateRequest);
  assert.equal(new URL(updateRequest.path, chatwootBaseUrl).searchParams.get("identifier_hash"), createHmac("sha256", hmacToken).update("maktaba_guest_abc").digest("hex"));
  assert.equal((JSON.parse(updateRequest.body) as { identifier: string }).identifier, "maktaba_guest_abc");

  assert.deepEqual(await client.listConversations(contact.source_id), []);
  assert.equal((await client.createConversation(contact.source_id)).id, 42);
  assert.equal((await client.getMessages(contact.source_id, 42))[0].content, "رد الموظف");
  assert.equal((await client.sendMessage(contact.source_id, 42, "رسالة")).message_type, 0);
  await client.toggleTyping(contact.source_id, 42, true);
  await client.updateLastSeen(contact.source_id, 42);
  assert.ok(requests.some(item => item.path.includes("toggle_typing")));
  assert.ok(requests.some(item => item.path.includes("update_last_seen")));
});
