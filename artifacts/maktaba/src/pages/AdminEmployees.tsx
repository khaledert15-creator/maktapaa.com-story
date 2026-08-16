import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { AdminPageState } from "@/components/admin/AdminPageState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminApi, useAdminResource } from "@/lib/admin-api";

type Employee = { id: number; name: string; email: string; role: string; permissions: string[]; isActive: boolean };

const roles = [
  ["administrator", "مدير النظام"], ["sales", "المبيعات"], ["customer_service", "خدمة العملاء"],
  ["warehouse", "المخزن"], ["shipping", "الشحن"], ["accountant", "الحسابات"], ["content_manager", "إدارة المحتوى"],
] as const;

const permissionGroups = [
  { title: "لوحة التحكم", items: [["dashboard.view", "عرض لوحة التحكم"]] },
  { title: "المنتجات", items: [["products.view", "عرض المنتجات"], ["products.create", "إضافة منتجات"], ["products.edit", "تعديل المنتجات"], ["prices.edit", "تعديل الأسعار"], ["products.images.manage", "إدارة الصور"], ["products.notices.manage", "إدارة تنبيهات المنتجات"], ["products.delete", "أرشفة أو حذف المنتجات"]] },
  { title: "المخزون", items: [["inventory.view", "عرض المخزون"], ["inventory.adjust", "تسجيل حركات المخزون"]] },
  { title: "الطلبات والعملاء", items: [["orders.view", "عرض الطلبات"], ["orders.edit", "تحديث الطلبات والإلغاءات"], ["orders.whatsapp", "فتح واتساب الطلب"], ["customers.view", "عرض العملاء"], ["customers.edit", "تعديل العملاء وحظرهم"]] },
  { title: "التشغيل", items: [["coupons.view", "عرض الكوبونات"], ["coupons.manage", "إدارة الكوبونات"], ["shipping.view", "عرض الشحن"], ["shipping.edit", "تعديل الشحن"], ["classifications.view", "عرض التصنيفات"], ["classifications.manage", "إدارة التصنيفات"]] },
  { title: "المحتوى والإدارة", items: [["content.view", "عرض المحتوى"], ["content.manage", "تعديل المحتوى"], ["branding.manage", "إدارة الهوية"], ["reports.view", "عرض التقارير"], ["audit.view", "عرض سجل الإجراءات"], ["employees.manage", "إدارة الموظفين"]] },
] as const;

const rolePresets: Record<string, string[]> = {
  sales: ["dashboard.view", "products.view", "orders.view", "orders.edit", "customers.view"],
  customer_service: ["dashboard.view", "orders.view", "orders.edit", "orders.whatsapp", "customers.view", "customers.edit"],
  warehouse: ["dashboard.view", "products.view", "inventory.view", "inventory.adjust", "orders.view"],
  shipping: ["dashboard.view", "orders.view", "orders.edit", "shipping.view"],
  accountant: ["dashboard.view", "orders.view", "reports.view"],
  content_manager: ["dashboard.view", "products.view", "products.edit", "products.images.manage", "products.notices.manage", "classifications.view", "classifications.manage", "content.view", "content.manage"],
  administrator: [],
};

const emptyDraft = { name: "", email: "", password: "", role: "sales", permissions: rolePresets.sales, isActive: true, allowNoPermissions: false };
type Draft = typeof emptyDraft;

export default function AdminEmployees() {
  const resource = useAdminResource<Employee[]>("/api/admin/employees");
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const roleNames = useMemo(() => Object.fromEntries(roles), []);

  const openCreate = () => { setEditing(null); setDraft({ ...emptyDraft, permissions: [...rolePresets.sales] }); setDialogOpen(true); };
  const openEdit = (employee: Employee) => { setEditing(employee); setDraft({ name: employee.name, email: employee.email, password: "", role: employee.role, permissions: [...employee.permissions], isActive: employee.isActive, allowNoPermissions: employee.permissions.length === 0 }); setDialogOpen(true); };
  const setRole = (role: string) => setDraft(value => ({ ...value, role, permissions: [...(rolePresets[role] || [])], allowNoPermissions: role === "administrator" }));
  const togglePermission = (permission: string, checked: boolean) => setDraft(value => ({ ...value, permissions: checked ? [...new Set([...value.permissions, permission])] : value.permissions.filter(item => item !== permission), allowNoPermissions: checked ? false : value.allowNoPermissions }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const ordinaryRole = !["administrator", "owner"].includes(draft.role);
    if (ordinaryRole && draft.permissions.length === 0 && !draft.allowNoPermissions) {
      toast({ title: "اختر صلاحية واحدة على الأقل", description: "أو فعّل التأكيد الصريح لإنشاء الموظف بدون صلاحيات.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { name: draft.name.trim(), email: draft.email.trim(), role: draft.role, permissions: draft.permissions, isActive: draft.isActive, ...(draft.password ? { password: draft.password } : {}) };
      await adminApi(editing ? `/api/admin/employees/${editing.id}` : "/api/admin/employees", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      toast({ title: editing ? "تم تحديث الموظف والصلاحيات" : "تم إنشاء الموظف" });
      setDialogOpen(false);
      await resource.reload();
    } catch (error) {
      toast({ title: "تعذر حفظ الموظف", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (employee: Employee) => {
    if (!window.confirm(`${employee.isActive ? "إيقاف" : "تفعيل"} حساب ${employee.name}؟`)) return;
    try {
      await adminApi(`/api/admin/employees/${employee.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !employee.isActive }) });
      toast({ title: employee.isActive ? "تم إيقاف الحساب" : "تم تفعيل الحساب" });
      await resource.reload();
    } catch (error) { toast({ title: "تعذر تغيير حالة الحساب", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); }
  };

  return <section className="space-y-6" dir="rtl">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold">الموظفون والصلاحيات</h1><p className="text-sm text-muted-foreground">تحكم دقيق في وصول كل موظف، مع إمكانية تعديل الصلاحيات لاحقًا.</p></div><Button onClick={openCreate}><Plus className="ml-2 h-4 w-4" />موظف جديد</Button></div>
    <AdminPageState loading={resource.loading} error={resource.error} empty={!resource.data?.length} onRetry={() => void resource.reload()}>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>الدور</TableHead><TableHead>الصلاحيات</TableHead><TableHead>الحالة</TableHead><TableHead>الإجراءات</TableHead></TableRow></TableHeader><TableBody>{resource.data?.map(employee => <TableRow key={employee.id}><TableCell><strong>{employee.name}</strong><div dir="ltr" className="text-right text-xs text-muted-foreground">{employee.email}</div></TableCell><TableCell>{roleNames[employee.role] || employee.role}</TableCell><TableCell><Badge variant="secondary">{["owner", "administrator"].includes(employee.role) ? "كامل الصلاحيات" : `${employee.permissions.length} صلاحية`}</Badge></TableCell><TableCell><Badge variant={employee.isActive ? "outline" : "destructive"}>{employee.isActive ? "نشط" : "متوقف"}</Badge></TableCell><TableCell><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(employee)}><Pencil className="ml-1 h-4 w-4" />تعديل</Button><Button size="sm" variant="ghost" onClick={() => void toggleActive(employee)}>{employee.isActive ? <UserX className="ml-1 h-4 w-4" /> : <UserCheck className="ml-1 h-4 w-4" />}{employee.isActive ? "إيقاف" : "تفعيل"}</Button></div></TableCell></TableRow>)}</TableBody></Table></div></Card>
    </AdminPageState>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-4xl" dir="rtl"><DialogHeader className="text-right"><DialogTitle>{editing ? "تعديل الموظف" : "إضافة موظف جديد"}</DialogTitle><DialogDescription>الدور يحدد اقتراحًا أوليًا فقط؛ الصلاحيات المحفوظة أدناه هي التي تُستخدم للموظفين العاديين.</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={save}>
      <div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="employee-name">الاسم</Label><Input id="employee-name" value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} required minLength={2} /></div><div><Label htmlFor="employee-email">البريد الإلكتروني</Label><Input id="employee-email" dir="ltr" type="email" value={draft.email} onChange={event => setDraft(value => ({ ...value, email: event.target.value }))} required /></div><div><Label htmlFor="employee-password">{editing ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}</Label><Input id="employee-password" dir="ltr" type="password" minLength={8} required={!editing} autoComplete="new-password" value={draft.password} onChange={event => setDraft(value => ({ ...value, password: event.target.value }))} /></div><div><Label htmlFor="employee-role">الدور</Label><select id="employee-role" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={draft.role} onChange={event => setRole(event.target.value)}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      {draft.role === "administrator" ? <Card className="border-primary/20 bg-primary/5"><CardContent className="flex items-center gap-3 pt-6"><ShieldCheck className="h-6 w-6 text-primary" /><p><strong>مدير النظام يمتلك جميع الصلاحيات.</strong><br /><span className="text-sm text-muted-foreground">لا يحتاج إلى اختيار صلاحيات منفردة.</span></p></CardContent></Card> : <div className="grid gap-3 md:grid-cols-2">{permissionGroups.map(group => <Card key={group.title}><CardHeader className="pb-3"><CardTitle className="text-base">{group.title}</CardTitle></CardHeader><CardContent className="space-y-3">{group.items.map(([permission, label]) => <label key={permission} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={draft.permissions.includes(permission)} onCheckedChange={checked => togglePermission(permission, checked === true)} /><span>{label}</span></label>)}</CardContent></Card>)}</div>}
      {draft.role !== "administrator" && draft.permissions.length === 0 && <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><Checkbox checked={draft.allowNoPermissions} onCheckedChange={checked => setDraft(value => ({ ...value, allowNoPermissions: checked === true }))} /><span><strong>أؤكد إنشاء/حفظ الموظف بدون أي صلاحيات.</strong><br />لن يتمكن من استخدام أقسام لوحة الإدارة حتى تُمنح له صلاحية.</span></label>}
      <div className="flex items-center justify-between rounded-lg border p-4"><div><Label htmlFor="employee-active">الحساب نشط</Label><p className="text-xs text-muted-foreground">الحساب المتوقف لا يستطيع تسجيل الدخول.</p></div><Switch id="employee-active" checked={draft.isActive} onCheckedChange={checked => setDraft(value => ({ ...value, isActive: checked }))} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button><Button type="submit" disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ الموظف"}</Button></div>
    </form></DialogContent></Dialog>
  </section>;
}
