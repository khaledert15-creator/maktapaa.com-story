import { useState, type FormEvent, type ReactNode } from "react";
import { Download, PackageCheck, PackageX, ShoppingCart, Truck, Users } from "lucide-react";
import { AdminPageState } from "@/components/admin/AdminPageState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminResource } from "@/lib/admin-api";

type SalesReport = {
  dateFrom: string; dateTo: string; grossRevenue: number; totalRevenue: number; shippingRevenue: number; totalOrders: number;
  cancelledOrders: number; newCustomers: number; avgOrderValue: number; statuses: { status: string; count: number }[];
  data: { date: string; amount: number; shipping: number; orderCount: number; cancelledCount: number }[];
};
type InventoryReport = { totalProducts: number; inStockCount: number; lowStockCount: number; outOfStockCount: number; totalInventoryValue: number };

const statusLabels: Record<string, string> = { new: "جديد", awaiting_confirmation: "بانتظار التأكيد", confirmed: "مؤكد", preparing: "قيد التجهيز", ready_for_shipping: "جاهز للشحن", shipped: "تم الشحن", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", delivery_failed: "تعذر التسليم", returned: "مرتجع", partially_returned: "مرتجع جزئيًا", cancelled: "ملغي" };
const today = new Date().toISOString().slice(0, 10);
const initialFrom = (() => { const date = new Date(); date.setDate(date.getDate() - 30); return date.toISOString().slice(0, 10); })();

function downloadCsv(report: SalesReport) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ["التاريخ", "صافي المبيعات", "إيراد الشحن", "عدد الطلبات", "الطلبات الملغاة"],
    ...report.data.map(row => [row.date, row.amount, row.shipping, row.orderCount, row.cancelledCount]),
  ];
  const blob = new Blob(["\uFEFF", rows.map(row => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `maktaba-sales-${report.dateFrom}-${report.dateTo}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(today);
  const [range, setRange] = useState({ from: initialFrom, to: today });
  const sales = useAdminResource<SalesReport>(`/api/admin/reports/sales?dateFrom=${range.from}&dateTo=${range.to}`);
  const inventory = useAdminResource<InventoryReport>("/api/admin/reports/inventory");
  const submitRange = (event: FormEvent) => { event.preventDefault(); setRange({ from: draftFrom, to: draftTo }); };
  const report = sales.data;

  return <section className="space-y-6" dir="rtl">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><h1 className="text-2xl font-bold">التقارير التشغيلية</h1><p className="text-sm text-muted-foreground">ملخص مباشر من PostgreSQL للمبيعات والطلبات والشحن والإلغاءات والعملاء والمخزون.</p></div><form onSubmit={submitRange} className="flex flex-col gap-2 sm:flex-row sm:items-end"><div><Label htmlFor="report-from">من</Label><Input id="report-from" type="date" value={draftFrom} max={draftTo} onChange={event => setDraftFrom(event.target.value)} required /></div><div><Label htmlFor="report-to">إلى</Label><Input id="report-to" type="date" value={draftTo} min={draftFrom} max={today} onChange={event => setDraftTo(event.target.value)} required /></div><Button type="submit">تطبيق</Button>{report && <Button type="button" variant="outline" onClick={() => downloadCsv(report)}><Download className="ml-2 h-4 w-4" />CSV</Button>}</form></div>
    <AdminPageState loading={sales.loading} error={sales.error} empty={!report} onRetry={() => void sales.reload()}>
      {report && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric title="صافي المبيعات" value={`${report.totalRevenue.toLocaleString("ar-EG")} ج.م`} icon={<ShoppingCart />} />
        <Metric title="إجمالي قبل الإلغاءات" value={`${report.grossRevenue.toLocaleString("ar-EG")} ج.م`} />
        <Metric title="إيراد الشحن" value={`${report.shippingRevenue.toLocaleString("ar-EG")} ج.م`} icon={<Truck />} />
        <Metric title="الطلبات" value={report.totalOrders.toLocaleString("ar-EG")} />
        <Metric title="الإلغاءات" value={report.cancelledOrders.toLocaleString("ar-EG")} />
        <Metric title="عملاء جدد" value={report.newCustomers.toLocaleString("ar-EG")} icon={<Users />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]"><Card className="overflow-hidden"><CardHeader><CardTitle>الحركة اليومية</CardTitle></CardHeader><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>صافي المبيعات</TableHead><TableHead>الشحن</TableHead><TableHead>الطلبات</TableHead><TableHead>الملغاة</TableHead></TableRow></TableHeader><TableBody>{report.data.length ? report.data.map(row => <TableRow key={row.date}><TableCell>{new Date(`${row.date}T12:00:00Z`).toLocaleDateString("ar-EG")}</TableCell><TableCell>{row.amount.toLocaleString("ar-EG")} ج.م</TableCell><TableCell>{row.shipping.toLocaleString("ar-EG")} ج.م</TableCell><TableCell>{row.orderCount}</TableCell><TableCell>{row.cancelledCount}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">لا توجد طلبات في الفترة المحددة</TableCell></TableRow>}</TableBody></Table></div></Card><Card><CardHeader><CardTitle>حالات الطلبات</CardTitle></CardHeader><CardContent className="space-y-3">{report.statuses.length ? report.statuses.map(row => <div key={row.status} className="flex items-center justify-between border-b pb-2 last:border-0"><span>{statusLabels[row.status] || row.status}</span><Badge variant="secondary">{row.count}</Badge></div>) : <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}<div className="flex items-center justify-between border-t pt-3"><span>متوسط الطلب</span><strong>{report.avgOrderValue.toLocaleString("ar-EG")} ج.م</strong></div></CardContent></Card></div></>}
    </AdminPageState>
    <AdminPageState loading={inventory.loading} error={inventory.error} empty={!inventory.data} onRetry={() => void inventory.reload()}>{inventory.data && <div><h2 className="mb-3 text-xl font-bold">حالة المنتجات والمخزون الآن</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric title="المنتجات النشطة" value={inventory.data.totalProducts.toLocaleString("ar-EG")} /><Metric title="متوفر" value={inventory.data.inStockCount.toLocaleString("ar-EG")} icon={<PackageCheck />} /><Metric title="مخزون منخفض" value={inventory.data.lowStockCount.toLocaleString("ar-EG")} /><Metric title="نفد المخزون" value={inventory.data.outOfStockCount.toLocaleString("ar-EG")} icon={<PackageX />} /><Metric title="قيمة المخزون" value={`${inventory.data.totalInventoryValue.toLocaleString("ar-EG")} ج.م`} /></div></div>}</AdminPageState>
  </section>;
}

function Metric({ title, value, icon }: { title: string; value: string; icon?: ReactNode }) {
  return <Card><CardContent className="flex items-start justify-between gap-3 pt-5"><div><p className="text-xs text-muted-foreground">{title}</p><strong className="mt-1 block text-xl">{value}</strong></div>{icon && <span className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}</CardContent></Card>;
}
