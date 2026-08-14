import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "@workspace/api-zod";
import { config } from "../lib/config";
import { rateLimit } from "../lib/rate-limit";
import { parseBody } from "../lib/validation";
import { subscribeToChatwootRealtime } from "../services/chatwoot-realtime";
import {
  getWebsiteChatAttachment,
  getWebsiteChatInbox,
  listWebsiteChatMessages,
  mapWebsiteChatMessage,
  markWebsiteChatRead,
  resolveWebsiteChatThread,
  sendWebsiteChatAttachment,
  sendWebsiteChatMessage,
  setWebsiteChatTyping,
  updateWebsiteChatContext,
  WebsiteChatUnavailableError,
  type ReadyWebsiteChatThread,
} from "../services/website-chat";
import {
  websiteChatPageContextSchema,
  WebsiteChatContextError,
} from "../services/website-chat-context";

const router: IRouter = Router();
const messageSchema = z.object({ content: z.string().trim().min(1).max(2_000) });
const typingSchema = z.object({ typing: z.boolean() });
const optionalContextSchema = z.object({ context: websiteChatPageContextSchema.optional() });
const beforeSchema = z.coerce.number().int().positive().optional();
const idSchema = z.coerce.number().int().positive();
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: config.WEBSITE_CHAT_ATTACHMENT_MAX_BYTES },
});
const chatRateKey = (req: Request) => String(req.session.customerId ?? req.session.websiteChatGuestId ?? req.ip);
const regularLimit = rateLimit({ namespace: "website-chat", windowMs: 60_000, max: 120, key: chatRateKey });
const sendLimit = rateLimit({ namespace: "website-chat-send", windowMs: 60_000, max: 20, key: chatRateKey });

function requireWebsiteChat(_req: Request, res: Response, next: NextFunction): void {
  if (!config.websiteChatEnabled) {
    res.status(503).json({ error: "خدمة المحادثة غير مفعّلة حاليًا", code: "CHAT_DISABLED" });
    return;
  }
  next();
}

function sendKnownError(error: unknown, res: Response): boolean {
  if (error instanceof WebsiteChatContextError) {
    res.status(error.status).json({ error: error.message, code: "CHAT_CONTEXT_INVALID" });
    return true;
  }
  if (error instanceof WebsiteChatUnavailableError) {
    res.status(503).json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

async function safelyResolve(req: Request, res: Response, context?: z.infer<typeof websiteChatPageContextSchema>): Promise<ReadyWebsiteChatThread | null> {
  try {
    return await resolveWebsiteChatThread(req, context);
  } catch (error) {
    if (sendKnownError(error, res)) return null;
    throw error;
  }
}

router.get("/chat/config", (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    enabled: config.websiteChatEnabled,
    title: "دردشة مكتبة دوت كوم",
    greeting: "أهلًا بك 👋 كيف نقدر نساعدك؟",
    offlineMessage: "اترك رسالتك وسنرد عليك في أقرب وقت.",
    quickActions: ["استفسار عن منتج", "متابعة طلب", "مشكلة في الطلب", "استفسار عن الشحن"],
    fallbackPollMs: config.WEBSITE_CHAT_FALLBACK_POLL_MS,
    attachmentMaxBytes: config.WEBSITE_CHAT_ATTACHMENT_MAX_BYTES,
  });
});

router.post("/chat/session", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const input = parseBody(optionalContextSchema, req.body, res); if (!input) return;
  const thread = await safelyResolve(req, res, input.context); if (!thread) return;
  try {
    await updateWebsiteChatContext(req, thread, input.context);
    const [messages, inbox] = await Promise.all([listWebsiteChatMessages(thread), getWebsiteChatInbox()]);
    const lastReadAt = thread.row.lastReadAt.getTime();
    const unreadCount = messages.filter(message => message.direction === "agent" && new Date(message.createdAt).getTime() > lastReadAt).length;
    res.setHeader("Cache-Control", "no-store");
    res.json({ messages, unreadCount, availability: "online", inbox });
  } catch (error) {
    if (!sendKnownError(error, res)) throw error;
  }
});

router.post("/chat/context", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const input = parseBody(optionalContextSchema, req.body, res); if (!input) return;
  const thread = await safelyResolve(req, res, input.context); if (!thread) return;
  try {
    await updateWebsiteChatContext(req, thread, input.context);
    res.status(204).end();
  } catch (error) {
    if (!sendKnownError(error, res)) throw error;
  }
});

router.get("/chat/messages", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const parsedBefore = beforeSchema.safeParse(req.query.before);
  if (!parsedBefore.success) { res.status(400).json({ error: "قيمة before غير صحيحة" }); return; }
  const thread = await safelyResolve(req, res); if (!thread) return;
  res.setHeader("Cache-Control", "no-store");
  res.json({ messages: await listWebsiteChatMessages(thread, parsedBefore.data) });
});

router.post("/chat/messages", requireWebsiteChat, sendLimit, async (req, res): Promise<void> => {
  const input = parseBody(messageSchema, req.body, res); if (!input) return;
  const thread = await safelyResolve(req, res); if (!thread) return;
  res.status(201).json({ message: await sendWebsiteChatMessage(thread, input.content) });
});

router.post("/chat/read", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const thread = await safelyResolve(req, res); if (!thread) return;
  await markWebsiteChatRead(thread);
  res.status(204).end();
});

router.post("/chat/typing", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const input = parseBody(typingSchema, req.body, res); if (!input) return;
  const thread = await safelyResolve(req, res); if (!thread) return;
  await setWebsiteChatTyping(thread, input.typing);
  res.status(204).end();
});

router.post("/chat/attachments", requireWebsiteChat, sendLimit, attachmentUpload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "اختر ملفًا لإرساله" }); return; }
  const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const pdf = req.file.mimetype === "application/pdf" && req.file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  let validImage = false;
  if (allowedImageMimeTypes.has(req.file.mimetype)) {
    try {
      const metadata = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
      validImage = metadata.format === "jpeg" || metadata.format === "png" || metadata.format === "webp";
    } catch { validImage = false; }
  }
  if (!pdf && !validImage) {
    res.status(400).json({ error: "الملف غير مدعوم. استخدم JPG أو PNG أو WebP أو PDF" });
    return;
  }
  const thread = await safelyResolve(req, res); if (!thread) return;
  const name = req.file.originalname.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150) || "attachment";
  const message = await sendWebsiteChatAttachment(thread, { buffer: req.file.buffer, name, type: req.file.mimetype });
  res.status(201).json({ message });
});

router.get("/chat/attachments/:messageId/:index", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const messageId = idSchema.safeParse(req.params.messageId);
  const index = z.coerce.number().int().min(0).max(9).safeParse(req.params.index);
  if (!messageId.success || !index.success) { res.status(400).json({ error: "رابط الملف غير صحيح" }); return; }
  const thread = await safelyResolve(req, res); if (!thread) return;
  const remoteUrl = await getWebsiteChatAttachment(thread, messageId.data, index.data);
  const response = await fetch(remoteUrl, { redirect: "error", signal: AbortSignal.timeout(config.CHATWOOT_REQUEST_TIMEOUT_MS) });
  if (!response.ok) { res.status(502).json({ error: "تعذر تحميل الملف" }); return; }
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimeType)) {
    res.status(415).json({ error: "نوع الملف غير مدعوم" }); return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > config.WEBSITE_CHAT_ATTACHMENT_MAX_BYTES) { res.status(413).json({ error: "حجم الملف أكبر من الحد المسموح" }); return; }
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(body.length));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(body);
});

router.get("/chat/events", requireWebsiteChat, regularLimit, async (req, res): Promise<void> => {
  const thread = await safelyResolve(req, res); if (!thread) return;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const abortController = new AbortController();
  const sendEvent = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => sendEvent("heartbeat", { at: Date.now() }), 20_000);
  const stopRealtime = subscribeToChatwootRealtime({
    pubsubToken: thread.pubsubToken,
    conversationId: thread.row.chatwootConversationId!,
    signal: abortController.signal,
    onStatus: status => sendEvent("status", { status }),
    onEvent: ({ event, data }) => {
      if (event === "message.created" && data && typeof data === "object") {
        sendEvent("message", mapWebsiteChatMessage(data as Parameters<typeof mapWebsiteChatMessage>[0]));
      } else if (event.includes("typing")) {
        sendEvent("typing", data);
      } else if (event.includes("presence") || event.includes("status")) {
        sendEvent("availability", data);
      }
    },
  });
  req.on("close", () => {
    clearInterval(heartbeat);
    abortController.abort();
    stopRealtime();
  });
});

export default router;
