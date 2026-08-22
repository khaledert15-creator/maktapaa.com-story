import { useState, type FormEvent } from "react";
import { Ban, Eye, Search, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "wouter";
import { AdminPageState } from "@/components/admin/AdminPageState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { adminApi, useAdminResource } from "@/lib/admin-api";

type Customer = {
  id: number; name: string; email?: string | null; mobile: string; primaryPhone: string; primaryPhoneHasWhatsApp: boolean;
  alternatePhone?: string | null; alternatePhoneHasWhatsApp: boolean; preferredWhatsAppPhone?: string | null; isBlocked: boolean;
  totalOrders: number; totalSpend: number; avgOrderValue: number; lastOrderDate?: string | null; internalNotes?: string | null; createdAt: string;
};
type CustomerDetail = Customer & { recentOrders: { id: number; orderNumber: string; status: string; total: number; createdAt: string }[] };
type CustomersResponse = { items: Customer[]; total: number; page: number; limit: number };

const orderStatus: Record<string, string> = { new: "جديد", awaiting_confirmation: "بانتظار التأكيد", confirmed: "مؤكد", preparing: "قيد التجهيز", ready_for_shipping: "جاهز للشحن", shipped: "تم الشحن", out_for_delivery: "خرج للتوصيل", delivered: "تم التسليم", delivery_failed: "تعذر التسليم", returned: "مرتجع", partially_returned: "مرتجع جزئيًا", cancelled: "ملغي" };

export default function AdminCustomers() {
  const { admin } = useAuth();
  const canEdit = Boolean(admin && (["owner", "administrator"].includes(admin.role) || admin.permissions?.includes("customers.edit")));
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const resource = useAdminResource<CustomersResponse>(`/api/admin/customers?page=${page}&limit=20&q=${encodeURIComponent(query)}`);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const totalPages = Math.max(1, Math.ceil((resource.data?.total || 0) / 20));

  const openCustomer = async (customer: Customer) => {
    setDetailLoading(true);
    try { setSelected(await adminApi<CustomerDetail>(`/api/admin/customers/${customer.id}`)); }
    catch (error) { toast({ title: "تعذر تحميل ملف العميل", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); }
    finally { setDetailLoading(false); }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !canEdit) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await adminApi(`/api/admin/customers/${selected.id}`, { method: "PATCH", body: JSON.stringify({
        primaryPhone: String(form.get("primaryPhone") || ""),
        primaryPhoneHasWhatsApp: form.get("primaryPhoneHasWhatsApp") === "on",
        alternatePhone: String(form.get("alternatePhone") || "") || null,
        alternatePhoneHasWhatsApp: form.get("alternatePhoneHasWhatsApp") === "on",
        preferredWhatsAppPhone: String(form.get("preferredWhatsAppPhone") || "") || null,
        internalNotes: String(form.get("internalNotes") || "") || null,
        isBlocked: form.get("isBlocked") === "on",
      }) });
      toast({ title: "تم حفظ بيانات العميل" });
      setSelected(await adminApi<CustomerDetail>(`/api/admin/customers/${selected.id}`));
      await resource.reload();
    } catch (error) { toast({ title: "تعذر حفظ بيانات العميل", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return <section className="space-y-6" dir="rtl">
    <div><h1 className="text-2xl font-bold">إدارة العملاء</h1><p className="text-sm text-muted-foreground">ابحث بالاسم أو البريد أو أي رقم هاتف، ثم راجع الطلبات والحالة دون إظهار كلمات المرور أو بيانات الجلسات.</p></div>
    <form className="flex max-w-xl gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(searchInput.trim()); }}><Input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="الاسم، البريد، الهاتف الأساسي أو البديل" /><Button type="submit"><Search className="ml-2 h-4 w-4" />بحث</Button></form>
    <AdminPageState loading={resource.loading} error={resource.error} empty={!resource.data?.items.length} onRetry={() => void resource.reload()}>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>العميل</TableHead><TableHead>الهاتف</TableHead><TableHead>الطلبات</TableHead><TableHead>إجمالي المشتريات</TableHead><TableHead>آخر طلب</TableHead><TableHead>الحالة</TableHead><TableHead>عرض</TableHead></TableRow></TableHeader><TableBody>{resource.data?.items.map(customer => <TableRow key={customer.id}><TableCell><strong>{customer.name}</strong><div dir="ltr" className="text-right text-xs text-muted-foreground">{customer.email || "بدون بريد"}</div></TableCell><TableCell dir="ltr" className="text-right">{customer.primaryPhone}</TableCell><TableCell>{customer.totalOrders}</TableCell><TableCell>{customer.totalSpend.toLocaleString("ar-EG")} ج.م</TableCell><TableCell>{customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString("ar-EG") : "—"}</TableCell><TableCell><Badge variant={customer.isBlocked ? "destructive" : "outline"}>{customer.isBlocked ? "محظور" : "نشط"}</Badge></TableCell><TableCell><Button size="sm" variant="outline" disabled={detailLoading} onClick={() => void openCustomer(customer)}><Eye className="ml-1 h-4 w-4" />التفاصيل</Button></TableCell></TableRow>)}</TableBody></Table></div></Card>
    </AdminPageState>
    {(resource.data?.total || 0) > 20 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</Button><span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>التالي</Button></div>}

    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-w-4xl" dir="rtl"><DialogHeader className="text-right"><DialogTitle>ملف العميل: {selected?.name}</DialogTitle><DialogDescription>بيانات الاتصال المسموح بها، ملخص المشتريات، وآخر 20 طلبًا.</DialogDescription></DialogHeader>{selected && <form className="space-y-5" onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">إجمالي الطلبات</p><strong className="text-xl">{selected.totalOrders}</strong></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">إجمالي المشتريات</p><strong className="text-xl">{selected.totalSpend.toLocaleString("ar-EG")} ج.م</strong></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">متوسط الطلب</p><strong className="text-xl">{selected.avgOrderValue.toLocaleString("ar-EG")} ج.م</strong></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">منذ</p><strong>{new Date(selected.createdAt).toLocaleDateString("ar-EG")}</strong></CardContent></Card></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="customer-primary-phone">الهاتف الأساسي</Label><Input id="customer-primary-phone" name="primaryPhone" dir="ltr" defaultValue={selected.primaryPhone} readOnly={!canEdit} /></div><label className="mt-7 flex items-center gap-2"><input className="h-4 w-4 accent-primary" type="checkbox" name="primaryPhoneHasWhatsApp" defaultChecked={selected.primaryPhoneHasWhatsApp} disabled={!canEdit} />الرقم الأساسي عليه واتساب</label><div><Label htmlFor="customer-alt-phone">الهاتف البديل</Label><Input id="customer-alt-phone" name="alternatePhone" dir="ltr" defaultValue={selected.alternatePhone || ""} readOnly={!canEdit} /></div><label className="mt-7 flex items-center gap-2"><input className="h-4 w-4 accent-primary" type="checkbox" name="alternatePhoneHasWhatsApp" defaultChecked={selected.alternatePhoneHasWhatsApp} disabled={!canEdit} />الرقم البديل عليه واتساب</label><div><Label htmlFor="preferred-whatsapp">رقم واتساب المفضل</Label><select id="preferred-whatsapp" name="preferredWhatsAppPhone" className="mt-1 h-10 w-full rounded-md border bg-background px-3" defaultValue={selected.preferredWhatsAppPhone || ""} disabled={!canEdit}><option value="">غير محدد</option><option value={selected.primaryPhone}>الأساسي — {selected.primaryPhone}</option>{selected.alternatePhone && <option value={selected.alternatePhone}>البديل — {selected.alternatePhone}</option>}</select></div><div><Label htmlFor="customer-email">البريد الإلكتروني</Label><Input id="customer-email" dir="ltr" value={selected.email || "غير مسجل"} readOnly /></div></div>
      <div><Label htmlFor="customer-notes">ملاحظات داخلية</Label><Textarea id="customer-notes" name="internalNotes" defaultValue={selected.internalNotes || ""} readOnly={!canEdit} placeholder="لا تظهر هذه الملاحظات للعميل" /></div>
      {canEdit && <label className={`flex items-center gap-3 rounded-lg border p-4 ${selected.isBlocked ? "border-destructive/40 bg-destructive/5" : ""}`}><input className="h-4 w-4 accent-primary" type="checkbox" name="isBlocked" defaultChecked={selected.isBlocked} /><span>{selected.isBlocked ? <Ban className="ml-2 inline h-4 w-4 text-destructive" /> : <UserCheck className="ml-2 inline h-4 w-4 text-emerald-700" />}حظر الحساب ومنع تسجيل دخوله</span></label>}
      <div><h2 className="mb-3 font-bold">أحدث الطلبات</h2>{selected.recentOrders.length ? <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>رقم الطلب</TableHead><TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader><TableBody>{selected.recentOrders.map(order => <TableRow key={order.id}><TableCell><Link href={`/admin/orders/${order.id}`} className="font-medium text-primary hover:underline">{order.orderNumber}</Link></TableCell><TableCell>{new Date(order.createdAt).toLocaleDateString("ar-EG")}</TableCell><TableCell><Badge variant="secondary">{orderStatus[order.status] || order.status}</Badge></TableCell><TableCell>{order.total.toLocaleString("ar-EG")} ج.م</TableCell></TableRow>)}</TableBody></Table></div> : <p className="rounded-lg border p-6 text-center text-muted-foreground">لا توجد طلبات لهذا العميل</p>}</div>
      <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />لا يتم عرض أي كلمة مرور أو بيانات جلسة.</p>{canEdit && <Button type="submit" disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ التغييرات"}</Button>}</div>
    </form>}</DialogContent></Dialog>
  </section>;
}
