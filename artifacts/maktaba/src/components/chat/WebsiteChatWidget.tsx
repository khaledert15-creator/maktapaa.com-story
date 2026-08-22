import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, CheckCheck, ChevronUp, Circle, FileText, Headphones, Loader2, MessageCircle, Paperclip, RefreshCw, Send, Smile, Sparkles, X } from "lucide-react";
import { useWebsiteChat } from "@/contexts/WebsiteChatContext";
import type { WebsiteChatMessage } from "@/lib/website-chat";

const emojis = ["👋", "😊", "🙏", "📚", "✅", "❤️"];

function messageTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Attachment({ message, index }: { message: WebsiteChatMessage; index: number }) {
  const attachment = message.attachments[index];
  const image = ["image", "jpeg", "jpg", "png", "webp"].some(type => attachment.type.toLowerCase().includes(type));
  if (image) return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-black/10"><img src={attachment.url} alt="صورة مرفقة" className="max-h-48 w-full object-cover" loading="lazy" /></a>;
  return <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-xs font-bold"><FileText className="h-4 w-4" /> فتح الملف المرفق</a>;
}

export default function WebsiteChatWidget() {
  const chat = useWebsiteChat();
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingStopTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!chat.isOpen) return;
    window.setTimeout(() => inputRef.current?.focus(), 150);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") chat.closeChat(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat.closeChat, chat.isOpen]);

  useEffect(() => { if (chat.isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat.agentTyping, chat.isOpen, chat.messages.length]);
  useEffect(() => () => { if (typingStopTimer.current !== null) window.clearTimeout(typingStopTimer.current); }, []);

  if (!chat.enabled) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await chat.sendMessage(draft)) {
      setDraft("");
      chat.notifyTyping(false);
    }
  };

  const onDraft = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
    chat.notifyTyping(Boolean(event.target.value.trim()));
    if (typingStopTimer.current !== null) window.clearTimeout(typingStopTimer.current);
    typingStopTimer.current = window.setTimeout(() => chat.notifyTyping(false), 1_500);
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await chat.sendAttachment(file);
    event.target.value = "";
  };

  const teamOnline = chat.status === "connected" && chat.agentAvailable !== false;
  const statusText = teamOnline ? "متاحون الآن" : chat.status === "connecting" || chat.status === "reconnecting" ? "جاري الاتصال…" : "غير متصل — اترك رسالة";

  return (
    <div dir="rtl" className="fixed bottom-40 left-4 z-[70] md:bottom-28 md:left-6">
      {chat.isOpen && (
        <div ref={panelRef} role="dialog" aria-modal="false" aria-label="دردشة مكتبة دوت كوم" className="fixed inset-x-2 bottom-40 top-3 flex origin-bottom-left animate-in flex-col overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white shadow-[0_28px_90px_rgba(15,23,42,.28)] duration-300 fade-in zoom-in-95 slide-in-from-bottom-4 sm:inset-auto sm:bottom-44 sm:left-5 sm:top-auto sm:h-[min(680px,calc(100dvh-12rem))] sm:w-[400px]">
          <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-5 pb-5 pt-4 text-white">
            <div className="absolute -left-8 -top-10 h-32 w-32 animate-pulse rounded-full bg-sky-500/30 blur-2xl motion-reduce:animate-none" />
            <div className="absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-950/40"><Headphones className="h-6 w-6" /><Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-amber-300" /></div>
                <div><h2 className="font-black tracking-tight">{chat.config?.title}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300"><span className="relative flex h-2.5 w-2.5"><span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:animate-none ${teamOnline ? "bg-emerald-400" : "bg-amber-400"}`} /><Circle className={`relative h-2.5 w-2.5 fill-current ${teamOnline ? "text-emerald-400" : "text-amber-400"}`} /></span>{statusText}</p></div>
              </div>
              <button type="button" onClick={chat.closeChat} aria-label="إغلاق المحادثة" className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
            {chat.loading ? <div className="grid h-full place-items-center text-center text-sm text-slate-500"><div><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-sky-500" />جاري تجهيز المحادثة الآمنة…</div></div> : chat.error && !chat.messages.length ? (
              <div className="grid h-full place-items-center text-center"><div className="max-w-[250px]"><AlertCircle className="mx-auto mb-3 h-9 w-9 text-amber-500" /><p className="font-bold text-slate-800">{chat.error}</p><p className="mt-2 text-xs leading-6 text-slate-500">يمكنك متابعة التصفح، ولن يؤثر تعطل الدردشة على الموقع.</p><button onClick={chat.retry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" /> إعادة المحاولة</button></div></div>
            ) : (
              <div className="space-y-3">
                <div className="mx-auto max-w-[90%] animate-in rounded-2xl rounded-tr-md border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-3 text-sm leading-6 text-slate-700 duration-300 fade-in slide-in-from-bottom-2"><strong className="mb-1 flex items-center gap-1.5 text-slate-950"><Sparkles className="h-4 w-4 text-sky-500" />فريق مكتبة دوت كوم</strong>{chat.config?.greeting}</div>
                {chat.messages.length > 0 && <button type="button" disabled={chat.loadingHistory} onClick={() => void chat.loadHistory()} className="mx-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-white"><ChevronUp className="h-3.5 w-3.5" />{chat.loadingHistory ? "جاري التحميل…" : "رسائل أقدم"}</button>}
                {chat.messages.map(message => (
                  <div key={message.id} className={`flex animate-in duration-200 fade-in slide-in-from-bottom-2 ${message.direction === "customer" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ${message.direction === "customer" ? "rounded-tr-md bg-slate-950 text-white" : message.direction === "agent" ? "rounded-tl-md border border-slate-200 bg-white text-slate-800" : "bg-amber-50 text-amber-900"}`}>
                      {message.senderName && <span className="mb-0.5 block text-[11px] font-bold text-sky-600">{message.senderName}</span>}
                      {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
                      {message.attachments.map((_, index) => <Attachment key={index} message={message} index={index} />)}
                      <span className={`mt-1 flex items-center gap-1 text-[10px] ${message.direction === "customer" ? "text-slate-400" : "text-slate-400"}`}>{messageTime(message.createdAt)}{message.direction === "customer" && <CheckCheck className="h-3 w-3" />}</span>
                    </div>
                  </div>
                ))}
                {chat.agentTyping && <div className="flex justify-end"><div className="rounded-2xl rounded-tl-md border bg-white px-4 py-3 text-xs text-slate-500"><span className="inline-flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" /></span> يكتب الآن</div></div>}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {!chat.loading && !chat.error && chat.messages.length === 0 && <div className="border-t bg-white px-4 py-3"><p className="mb-2 text-xs font-bold text-slate-500">كيف نساعدك؟</p><div className="flex gap-2 overflow-x-auto pb-1">{chat.config?.quickActions.map(action => <button key={action} onClick={() => void chat.sendMessage(action)} className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100">{action}</button>)}</div></div>}

          <form onSubmit={submit} className="relative border-t border-slate-200 bg-white p-3">
            {chat.error && chat.messages.length > 0 && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{chat.error}</p>}
            {emojiOpen && <div className="absolute bottom-full right-3 mb-2 flex gap-1 rounded-xl border bg-white p-2 shadow-lg">{emojis.map(emoji => <button type="button" key={emoji} onClick={() => { setDraft(value => value + emoji); setEmojiOpen(false); inputRef.current?.focus(); }} className="rounded-lg p-1.5 text-lg hover:bg-slate-100">{emoji}</button>)}</div>}
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
              <textarea ref={inputRef} value={draft} onChange={onDraft} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={2000} aria-label="اكتب رسالتك" placeholder="اكتب رسالتك…" disabled={chat.loading} className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" />
              <button type="button" onClick={() => setEmojiOpen(value => !value)} aria-label="إضافة رمز تعبيري" className="rounded-xl p-2 text-slate-500 hover:bg-white"><Smile className="h-5 w-5" /></button>
              <label className="cursor-pointer rounded-xl p-2 text-slate-500 hover:bg-white" aria-label="إرفاق ملف"><Paperclip className="h-5 w-5" /><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFile} className="sr-only" /></label>
              <button type="submit" disabled={!draft.trim() || chat.sending} aria-label="إرسال" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500 text-white transition hover:bg-sky-600 disabled:opacity-50">{chat.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rotate-180" />}</button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">لا تشارك كلمة المرور أو بيانات دفع حساسة في المحادثة</p>
          </form>
        </div>
      )}

      <button type="button" onClick={() => chat.isOpen ? chat.closeChat() : chat.openChat()} aria-expanded={chat.isOpen} aria-label={chat.isOpen ? "إغلاق المحادثة" : "افتح دردشة الدعم"} className="group relative flex h-14 items-center gap-2 rounded-full border border-white/10 bg-gradient-to-l from-slate-950 to-slate-900 px-3.5 text-white shadow-[0_14px_40px_rgba(15,23,42,.34)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(14,165,233,.25)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50 motion-reduce:transform-none md:h-16 md:px-4">
        <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-sky-400/20 blur-md motion-reduce:animate-none" />
        <span className="relative grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-500/30 transition duration-300 group-hover:rotate-[-8deg] group-hover:scale-105 motion-reduce:transform-none"><MessageCircle className="h-5 w-5 fill-white/10" /><span className="absolute inset-0 animate-ping rounded-full border border-sky-300/50 opacity-40 [animation-duration:2.8s] motion-reduce:animate-none" />{chat.unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-950 ring-2 ring-white">{Math.min(chat.unreadCount, 99)}</span>}</span>
        <span className="hidden text-right text-xs font-black sm:block"><span className="block">محتاج مساعدة؟</span><span className="mt-0.5 block font-normal text-slate-300">تحدث معنا الآن</span></span>
      </button>
    </div>
  );
}
