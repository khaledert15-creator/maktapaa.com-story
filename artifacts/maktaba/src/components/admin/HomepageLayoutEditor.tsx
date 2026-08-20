import { useEffect, useMemo, useState } from "react";
import type { HomepageLayout, HomepageModelLayout, HomepageSectionLayout } from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, Eye, ImagePlus, LayoutGrid, Plus, Save, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type NamedOption = { id: number; nameAr: string; isActive: boolean; stageId?: number | null };
type ProductOption = { id: number; nameAr: string; slug: string; coverImage?: string | null; status: string };
type AdminHomepagePayload = {
  layout: HomepageLayout;
  options: {
    stages: NamedOption[];
    grades: NamedOption[];
    subjects: NamedOption[];
    teachers: NamedOption[];
    products: ProductOption[];
  };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...(!isForm && init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.error || body?.message || "تعذر الاتصال بالخادم");
  }
  return response.json() as Promise<T>;
}

export function HomepageLayoutEditor({ onSaved }: { onSaved: () => Promise<void> | void }) {
  const { toast } = useToast();
  const [payload, setPayload] = useState<AdminHomepagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingModel, setUploadingModel] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    request<AdminHomepagePayload>("/api/admin/content/homepage-layout")
      .then(value => { if (active) setPayload(value); })
      .catch(reason => toast({ title: "تعذر تحميل أقسام الصفحة الرئيسية", description: reason instanceof Error ? reason.message : String(reason), variant: "destructive" }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  const layout = payload?.layout;
  const updateLayout = (next: HomepageLayout) => setPayload(current => current ? { ...current, layout: next } : current);
  const updateDiscovery = (changes: Partial<HomepageLayout["discovery"]>) => {
    if (!layout) return;
    updateLayout({ ...layout, discovery: { ...layout.discovery, ...changes } });
  };
  const updateSection = (key: "stages" | "grades" | "subjects", changes: Partial<HomepageSectionLayout>) => {
    if (!layout) return;
    updateLayout({ ...layout, [key]: { ...layout[key], ...changes } });
  };

  const renameOption = async (kind: "stages" | "grades" | "subjects" | "teachers", id: number, currentName: string, nextName: string) => {
    const nameAr = nextName.trim();
    if (!nameAr || nameAr === currentName || !payload) return;
    try {
      await request(`/api/admin/classifications/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ nameAr }) });
      setPayload(current => current ? { ...current, options: { ...current.options, [kind]: current.options[kind].map(item => item.id === id ? { ...item, nameAr } : item) } } : current);
      await onSaved();
      toast({ title: "تم تعديل الاسم", description: "ظهر الاسم الجديد في المتجر مباشرة." });
    } catch (reason) {
      toast({ title: "تعذر تعديل الاسم", description: reason instanceof Error ? reason.message : String(reason), variant: "destructive" });
    }
  };

  const uploadImage = async (index: number, file?: File) => {
    if (!file || !layout) return;
    setUploadingModel(index);
    try {
      const body = new FormData(); body.append("image", file);
      const image = await request<{ imageUrl: string; imageStorageKey: string }>("/api/admin/content/homepage-layout/model-image", { method: "POST", body });
      const models = layout.discovery.models.map((model, modelIndex) => modelIndex === index ? { ...model, ...image } : model);
      updateDiscovery({ models });
      toast({ title: "تم رفع صورة المجسم", description: "اضغط حفظ الأقسام لنشرها في المتجر." });
    } catch (reason) {
      toast({ title: "تعذر رفع الصورة", description: reason instanceof Error ? reason.message : String(reason), variant: "destructive" });
    } finally { setUploadingModel(null); }
  };

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      const saved = await request<HomepageLayout>("/api/admin/content/homepage-layout", { method: "PUT", body: JSON.stringify(layout) });
      setPayload(current => current ? { ...current, layout: saved } : current);
      await onSaved();
      toast({ title: "تم حفظ أقسام الصفحة الرئيسية", description: "الإضافة والحذف والترتيب والنصوص أصبحت ظاهرة في المتجر." });
    } catch (reason) {
      toast({ title: "تعذر حفظ الأقسام", description: reason instanceof Error ? reason.message : String(reason), variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="py-16 text-center text-muted-foreground">جاري تحميل الأقسام القابلة للتحكم...</CardContent></Card>;
  if (!payload || !layout) return <Card className="border-destructive/30"><CardContent className="py-16 text-center text-destructive">تعذر فتح محرر أقسام الصفحة الرئيسية.</CardContent></Card>;

  const options = payload.options;
  return <div className="space-y-6">
    <Card className="overflow-hidden border-sky-200">
      <CardHeader className="bg-gradient-to-l from-sky-50 to-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><CardTitle className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-sky-600" /> التحكم الكامل في أقسام المتجر</CardTitle><CardDescription className="mt-2">تحكم في الظهور والنصوص والعناصر وترتيبها. اضغط حفظ في نهاية التعديل.</CardDescription></div>
          <div className="flex gap-2"><Button asChild type="button" variant="outline"><Link href="/" target="_blank"><Eye className="ml-2 h-4 w-4" /> فتح المتجر</Link></Button><Button type="button" onClick={() => void save()} disabled={saving}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ الأقسام"}</Button></div>
        </div>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>القسم التفاعلي والمجسمات</CardTitle><CardDescription className="mt-2">كل النصوص والقوائم والصور التالية قابلة للتغيير بدون تعديل الكود.</CardDescription></div><Switch checked={layout.discovery.enabled} onCheckedChange={enabled => updateDiscovery({ enabled })} aria-label="إظهار القسم التفاعلي" /></div></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="نص الشارة" value={layout.discovery.badgeText} onChange={badgeText => updateDiscovery({ badgeText })} />
          <TextField label="العنوان الرئيسي" value={layout.discovery.title} onChange={title => updateDiscovery({ title })} />
          <div className="md:col-span-2"><Label>الوصف</Label><Textarea className="mt-2" value={layout.discovery.description} onChange={event => updateDiscovery({ description: event.target.value })} /></div>
          <TextField label="عنوان مجموعة الثانوية" value={layout.discovery.secondaryTitle} onChange={secondaryTitle => updateDiscovery({ secondaryTitle })} />
          <TextField label="عنوان مجموعة البكالوريا" value={layout.discovery.baccalaureateTitle} onChange={baccalaureateTitle => updateDiscovery({ baccalaureateTitle })} />
          <TextField label="عنوان كتب المدرسين" value={layout.discovery.teachersTitle} onChange={teachersTitle => updateDiscovery({ teachersTitle })} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <SortablePicker title="صفوف الثانوية داخل القسم" options={options.grades} selectedIds={layout.discovery.secondaryGradeIds} onChange={secondaryGradeIds => updateDiscovery({ secondaryGradeIds })} onRename={(id, current, next) => renameOption("grades", id, current, next)} />
          <SortablePicker title="صفوف البكالوريا داخل القسم" options={options.grades} selectedIds={layout.discovery.baccalaureateGradeIds} onChange={baccalaureateGradeIds => updateDiscovery({ baccalaureateGradeIds })} onRename={(id, current, next) => renameOption("grades", id, current, next)} />
          <SortablePicker title="المدرسون داخل القسم" options={options.teachers} selectedIds={layout.discovery.teacherIds} onChange={teacherIds => updateDiscovery({ teacherIds })} onRename={(id, current, next) => renameOption("teachers", id, current, next)} />
        </div>

        <div className="rounded-2xl border bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">المجسمات التفاعلية</h3><p className="mt-1 text-sm text-muted-foreground">اختر المنتج، غيّر الصورة، واكتب النص الذي يظهر تحته. الحد الأقصى 3 للحفاظ على السرعة والتصميم.</p></div><Button type="button" size="sm" variant="outline" disabled={layout.discovery.models.length >= 3 || !options.products.some(product => product.status === "active" && !layout.discovery.models.some(model => model.productId === product.id))} onClick={() => {
            const product = options.products.find(item => item.status === "active" && !layout.discovery.models.some(model => model.productId === item.id));
            if (product) updateDiscovery({ models: [...layout.discovery.models, { productId: product.id, imageUrl: null, imageStorageKey: null, caption: null }] });
          }}><Plus className="ml-2 h-4 w-4" /> إضافة مجسم</Button></div>
          {!layout.discovery.models.length ? <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد مجسمات. يمكنك ترك القسم بدونها أو إضافة مجسم جديد.</div> : <div className="mt-5 grid gap-4 xl:grid-cols-3">{layout.discovery.models.map((model, index) => <ModelEditor key={`${model.productId}-${index}`} index={index} model={model} products={options.products} models={layout.discovery.models} uploading={uploadingModel === index} onUpload={file => void uploadImage(index, file)} onChange={next => updateDiscovery({ models: layout.discovery.models.map((item, itemIndex) => itemIndex === index ? next : item) })} onMove={direction => updateDiscovery({ models: moveItem(layout.discovery.models, index, direction) })} onDelete={() => updateDiscovery({ models: layout.discovery.models.filter((_, itemIndex) => itemIndex !== index) })} />)}</div>}
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-6 xl:grid-cols-3">
      <SectionEditor title="المراحل الدراسية" section={layout.stages} options={options.stages} onChange={changes => updateSection("stages", changes)} onRename={(id, current, next) => renameOption("stages", id, current, next)} />
      <SectionEditor title="الصفوف المتاحة" section={layout.grades} options={options.grades} onChange={changes => updateSection("grades", changes)} onRename={(id, current, next) => renameOption("grades", id, current, next)} />
      <SectionEditor title="تصفح حسب المادة" section={layout.subjects} options={options.subjects} onChange={changes => updateSection("subjects", changes)} onRename={(id, current, next) => renameOption("subjects", id, current, next)} />
    </div>

    <div className="sticky bottom-4 z-20 flex justify-end"><Button size="lg" className="shadow-xl" onClick={() => void save()} disabled={saving}><Save className="ml-2 h-5 w-5" />{saving ? "جاري الحفظ..." : "حفظ ونشر التغييرات"}</Button></div>
  </div>;
}

function SectionEditor({ title, section, options, onChange, onRename }: { title: string; section: HomepageSectionLayout; options: NamedOption[]; onChange: (changes: Partial<HomepageSectionLayout>) => void; onRename: (id: number, current: string, next: string) => Promise<void> }) {
  return <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{title}</CardTitle><CardDescription className="mt-1">إظهار، إضافة، إزالة، ترتيب وتعديل الاسم.</CardDescription></div><Switch checked={section.enabled} onCheckedChange={enabled => onChange({ enabled })} /></div></CardHeader><CardContent className="space-y-4"><TextField label="عنوان القسم" value={section.title} onChange={value => onChange({ title: value })} /><TextField label="الوصف (اختياري)" value={section.subtitle || ""} onChange={value => onChange({ subtitle: value || null })} /><SortablePicker title="العناصر الظاهرة" options={options} selectedIds={section.itemIds} onChange={itemIds => onChange({ itemIds })} onRename={onRename} compact /></CardContent></Card>;
}

function SortablePicker({ title, options, selectedIds, onChange, onRename, compact = false }: { title: string; options: NamedOption[]; selectedIds: number[]; onChange: (ids: number[]) => void; onRename: (id: number, current: string, next: string) => Promise<void>; compact?: boolean }) {
  const [pendingId, setPendingId] = useState("");
  const optionMap = useMemo(() => new Map(options.map(option => [option.id, option])), [options]);
  const available = options.filter(option => !selectedIds.includes(option.id));
  return <div className={compact ? "space-y-3" : "rounded-2xl border p-4"}><Label>{title}</Label><div className="mt-2 flex gap-2"><Select value={pendingId} onValueChange={setPendingId}><SelectTrigger><SelectValue placeholder="اختر عنصرًا لإضافته" /></SelectTrigger><SelectContent>{available.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.nameAr}{!option.isActive ? " — غير نشط" : ""}</SelectItem>)}</SelectContent></Select><Button type="button" size="icon" variant="outline" aria-label="إضافة" disabled={!pendingId} onClick={() => { const id = Number(pendingId); if (id) onChange([...selectedIds, id]); setPendingId(""); }}><Plus className="h-4 w-4" /></Button></div><div className="mt-3 space-y-2">{selectedIds.map((id, index) => {
    const option = optionMap.get(id); if (!option) return null;
    return <div key={id} className="flex items-center gap-1 rounded-xl border bg-background p-2"><Input defaultValue={option.nameAr} aria-label={`اسم ${option.nameAr}`} className="h-9 min-w-0 flex-1 border-0 bg-transparent font-bold focus-visible:ring-1" onBlur={event => void onRename(id, option.nameAr, event.target.value)} /><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => onChange(moveItem(selectedIds, index, -1))}><ArrowUp className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === selectedIds.length - 1} onClick={() => onChange(moveItem(selectedIds, index, 1))}><ArrowDown className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onChange(selectedIds.filter(value => value !== id))}><Trash2 className="h-3.5 w-3.5" /></Button></div>;
  })}{!selectedIds.length && <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">لا توجد عناصر ظاهرة.</div>}</div></div>;
}

function ModelEditor({ index, model, products, models, uploading, onUpload, onChange, onMove, onDelete }: { index: number; model: HomepageModelLayout; products: ProductOption[]; models: HomepageModelLayout[]; uploading: boolean; onUpload: (file?: File) => void; onChange: (model: HomepageModelLayout) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const product = products.find(item => item.id === model.productId);
  const preview = model.imageUrl || product?.coverImage;
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><Badge variant="secondary">مجسم {index + 1}</Badge><div className="flex"><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === models.length - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></div></div><div className="mb-4 flex h-44 items-center justify-center overflow-hidden rounded-xl bg-slate-950">{preview ? <img src={preview} alt="معاينة صورة المجسم" className="h-full w-full object-contain" /> : <ImagePlus className="h-12 w-12 text-white/30" />}</div><div className="space-y-3"><div><Label>المنتج المرتبط</Label><Select value={String(model.productId)} onValueChange={value => onChange({ ...model, productId: Number(value) })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{products.filter(item => item.status === "active" && (item.id === model.productId || !models.some(selected => selected.productId === item.id))).map(item => <SelectItem key={item.id} value={String(item.id)}>{item.nameAr}</SelectItem>)}</SelectContent></Select></div><div><Label>النص أسفل المجسم</Label><Input className="mt-2" value={model.caption || ""} onChange={event => onChange({ ...model, caption: event.target.value || null })} placeholder={product?.nameAr || "اسم المنتج"} />{model.caption && <Button type="button" size="sm" variant="link" className="mt-1 h-auto px-0 text-xs" onClick={() => onChange({ ...model, caption: null })}>استخدام اسم المنتج تلقائيًا</Button>}</div><div><Label htmlFor={`model-image-${index}`}>صورة الغلاف المخصصة</Label><Input id={`model-image-${index}`} className="mt-2 cursor-pointer" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => onUpload(event.target.files?.[0])} /><p className="mt-1 text-xs text-muted-foreground">اتركها بدون صورة لاستخدام صورة المنتج تلقائيًا.</p></div>{model.imageUrl && <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...model, imageUrl: null, imageStorageKey: null })}>استخدام صورة المنتج</Button>}</div></div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><Label>{label}</Label><Input className="mt-2" value={value} onChange={event => onChange(event.target.value)} /></div>;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
