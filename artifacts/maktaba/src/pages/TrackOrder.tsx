import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Copy, PackageCheck, PackageSearch, Search, Truck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/storefront/Seo";
import { useToast } from "@/hooks/use-toast";

type Shipment = { id: string; books: string; amount: string; paymentMethod: string; shippingStatus: string; trackingNumber: string | null; deliveryStatus: string; receivedAt: string | null; shippedAt: string | null };

const delivered = (status: string) => status.includes("تم التسليم");
const returned = (status: string) => status.includes("مرتجع") || status.includes("إلغاء");
const moving = (status: string) => status.includes("الشحن") || status.includes("النقل") || status.includes("محاولة") || status.includes("دليفري");

function statusStyle(status: string) {
  if (delivered(status)) return { icon: CheckCircle2, label: "تم الاستلام", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500" };
  if (returned(status)) return { icon: Undo2, label: status, className: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500" };
  if (moving(status)) return { icon: Truck, label: status, className: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500" };
  return { icon: Clock3, label: status || "قيد التجهيز", className: "bg-amber-50 text-amber-700 ring-amber-200", bar: "bg-amber-400" };
}

function ShipmentCard({ shipment, index }: { shipment: Shipment; index: number }) {
  const { toast } = useToast();
  const style = statusStyle(shipment.deliveryStatus || shipment.shippingStatus);
  const Icon = style.icon;
  const bookLines = shipment.books.split("\n").map(line => line.trim()).filter(Boolean);
  const visibleBooks = bookLines.filter(line => !/^(المجموع|تكلفة الشحن|الاجمالي|تم دفع|المتبقي)/.test(line)).slice(0, 4);
  return <Card className="group overflow-hidden rounded-[1.75rem] border-slate-200/80 bg-white shadow-[0_18px_55px_-38px_rgba(15,23,42,.55)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_65px_-38px_rgba(2,132,199,.45)]">
    <div className={`h-1.5 w-full ${style.bar}`} />
    <CardContent className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${style.className}`}><Icon className="h-6 w-6" /></div><div><p className="text-xs font-bold text-slate-400">الشحنة {index + 1}</p><h2 className="mt-1 text-lg font-black text-slate-950">{style.label}</h2></div></div>{(shipment.shippedAt || shipment.receivedAt) && <div className="rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">{shipment.shippedAt || shipment.receivedAt}</div>}</div>
      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50/80 p-4 sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="mb-2 text-xs font-bold text-slate-400">محتويات الطلب</p>{visibleBooks.length ? <ul className="space-y-1.5">{visibleBooks.map((book, itemIndex) => <li key={`${book}-${itemIndex}`} className="flex gap-2 text-sm font-bold text-slate-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />{book}</li>)}</ul> : <p className="text-sm text-slate-500">تفاصيل الكتب مسجلة مع الطلب</p>}</div>{shipment.amount && <div className="text-left sm:min-w-28"><p className="text-xs font-bold text-slate-400">المبلغ</p><strong className="mt-1 block text-lg text-slate-950" dir="ltr">{shipment.amount}</strong></div>}</div>
      {shipment.trackingNumber && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3"><div><p className="text-xs font-bold text-sky-700">كود الشحنة</p><strong className="mt-1 block font-mono text-base text-slate-950" dir="ltr">{shipment.trackingNumber}</strong></div><Button type="button" variant="ghost" size="sm" className="rounded-xl text-sky-700" onClick={async () => { await navigator.clipboard.writeText(shipment.trackingNumber!); toast({ title: "تم نسخ كود الشحنة" }); }}><Copy className="ml-2 h-4 w-4" />نسخ</Button></div>}
    </CardContent>
  </Card>;
}

export default function TrackOrder() {
  const url = new URLSearchParams(window.location.search);
  const [mobile, setMobile] = useState(url.get("mobile") || "");
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const summary = useMemo(() => { const list = shipments || []; return { total: list.length, delivered: list.filter(item => delivered(item.deliveryStatus)).length, active: list.filter(item => !delivered(item.deliveryStatus) && !returned(item.deliveryStatus)).length, returned: list.filter(item => returned(item.deliveryStatus)).length }; }, [shipments]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(""); setShipments(null);
    const params = new URLSearchParams({ mobile: mobile.trim() });
    window.history.replaceState(null, "", `/track?${params}`);
    try {
      const response = await fetch(`/api/orders/shipments?${params}`, { credentials: "include" });
      const data = await response.json() as { shipments?: Shipment[]; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر البحث عن الشحنات");
      setShipments(data.shipments || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر البحث عن الشحنات"); }
    finally { setLoading(false); }
  };

  return <div className="min-h-[70vh] bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,.12),transparent_32%),radial-gradient(circle_at_top_left,rgba(59,130,246,.08),transparent_25%)]"><Seo title="تتبع طلبك | مكتبة دوت كوم" description="شاهد كل شحناتك وحالتها بسهولة باستخدام رقم الموبايل." /><div className="container mx-auto max-w-5xl px-4 py-10 sm:py-16">
    <div className="mx-auto max-w-2xl text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200"><PackageSearch className="h-8 w-8" /></div><h1 className="mt-5 text-3xl font-black text-slate-950 sm:text-4xl">تابع كل شحناتك بسهولة</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-500">اكتب رقم الموبايل المسجل مع الطلب، وسنعرض لك كل شحناتك القديمة والجديدة وحالتها الحالية.</p></div>
    <Card className="mx-auto mt-8 max-w-2xl rounded-[2rem] border-white/80 bg-white/90 shadow-[0_24px_70px_-42px_rgba(2,132,199,.65)] backdrop-blur"><CardContent className="p-5 sm:p-7"><form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div><Label htmlFor="track-mobile" className="mb-2 block font-extrabold text-slate-700">رقم الموبايل</Label><Input id="track-mobile" value={mobile} onChange={event => { setMobile(event.target.value); setShipments(null); setError(""); }} placeholder="01xxxxxxxxx" inputMode="tel" autoComplete="tel" dir="ltr" className="h-13 rounded-2xl border-slate-200 bg-slate-50 px-5 text-lg focus-visible:bg-white" required /></div><Button type="submit" className="h-13 rounded-2xl px-7 text-base font-black shadow-lg shadow-sky-100" disabled={loading}><Search className="ml-2 h-5 w-5" />{loading ? "جاري البحث..." : "عرض شحناتي"}</Button></form><p className="mt-3 text-center text-xs text-slate-400">نستخدم الرقم للبحث فقط، ولا نعرض اسمك أو عنوانك.</p></CardContent></Card>
    {loading && <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">{[1, 2].map(item => <div key={item} className="h-64 animate-pulse rounded-[1.75rem] border bg-white/70" />)}</div>}
    {error && <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-rose-100 bg-rose-50 p-6 text-center"><PackageSearch className="mx-auto mb-3 h-10 w-10 text-rose-300" /><h2 className="font-black text-rose-900">لم نتمكن من البحث الآن</h2><p className="mt-1 text-sm text-rose-700">{error}</p></div>}
    {shipments && shipments.length === 0 && <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-dashed bg-white/70 p-10 text-center"><PackageSearch className="mx-auto mb-3 h-12 w-12 text-slate-300" /><h2 className="text-xl font-black text-slate-900">لا توجد شحنات بهذا الرقم</h2><p className="mt-2 text-slate-500">تأكد أن الرقم هو نفسه المكتوب عند تسجيل الطلب، ويمكنك المحاولة مرة أخرى.</p></div>}
    {shipments && shipments.length > 0 && <section className="mt-10"><div className="mb-6 overflow-hidden rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl shadow-slate-200 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold text-sky-300">ملخص شحناتك</p><h2 className="mt-1 text-2xl font-black">وجدنا {summary.total} {summary.total === 1 ? "شحنة" : "شحنات"}</h2></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-300">{summary.delivered} تم استلامها</span><span className="rounded-full bg-sky-500/15 px-3 py-2 text-sm font-bold text-sky-300">{summary.active} جارية</span>{summary.returned > 0 && <span className="rounded-full bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-300">{summary.returned} متوقفة</span>}</div></div></div><div className="grid gap-5 lg:grid-cols-2">{shipments.map((shipment, index) => <ShipmentCard key={shipment.id} shipment={shipment} index={index} />)}</div><div className="mx-auto mt-7 flex max-w-xl items-center justify-center gap-3 rounded-2xl border border-sky-100 bg-white/75 p-4 text-center text-sm text-slate-600"><PackageCheck className="h-5 w-5 shrink-0 text-sky-600" /><span>الحالة المعروضة هي آخر حالة مسجلة لشحنتك.</span></div></section>}
  </div></div>;
}
