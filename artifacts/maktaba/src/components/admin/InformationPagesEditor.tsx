import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cloneInformationPageContent, informationPageLabels, informationPages, parseInformationPageContent, type InformationPageContent } from "@/content/information-pages";
import { adminApi } from "@/lib/admin-api";

type Setting = { id: number; key: string; value?: string | null };

export function InformationPagesEditor({ settings, onSaved }: { settings: Setting[]; onSaved: (setting: Setting) => void }) {
  const [slug, setSlug] = useState("about");
  const [draft, setDraft] = useState<InformationPageContent>(informationPages.about);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const saved = settings.find(row => row.key === `page.${slug}`)?.value;
    if (saved) {
      try {
        const parsed = parseInformationPageContent(JSON.parse(saved));
        if (parsed) { setDraft(parsed); return; }
      } catch { /* Preserve the safe repository copy. */ }
    }
    setDraft(cloneInformationPageContent(informationPages[slug]));
  }, [settings, slug]);

  const save = async () => {
    if (!draft.title.trim() || !draft.intro.trim() || draft.sections.some(section => !section.title.trim() || !section.body.trim())) {
      toast({ title: "أكمل العنوان والمقدمة وكل الأقسام", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const setting = await adminApi<Setting>(`/api/admin/content/settings/${encodeURIComponent(`page.${slug}`)}`, { method: "PUT", body: JSON.stringify({ value: JSON.stringify(draft) }) });
      onSaved(setting);
      toast({ title: "تم حفظ الصفحة", description: "سيظهر النص الجديد مباشرة للزوار." });
    } catch (error) { toast({ title: "تعذر حفظ الصفحة", description: error instanceof Error ? error.message : String(error), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5" dir="rtl"><Card><CardHeader><CardTitle>اختر صفحة المعلومات</CardTitle></CardHeader><CardContent><Select value={slug} onValueChange={setSlug}><SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(informationPageLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    <Card><CardContent className="space-y-5 pt-6"><div><Label htmlFor="info-title">عنوان الصفحة</Label><Input id="info-title" value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></div><div><Label htmlFor="info-intro">المقدمة</Label><Textarea id="info-intro" value={draft.intro} onChange={event => setDraft(value => ({ ...value, intro: event.target.value }))} /></div>
      <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-bold">أقسام الصفحة</h3><Button type="button" size="sm" variant="outline" onClick={() => setDraft(value => ({ ...value, sections: [...value.sections, { title: "", body: "" }] }))}><Plus className="ml-1 h-4 w-4" />قسم</Button></div>{draft.sections.map((section, index) => <div key={index} className="grid gap-3 rounded-xl border p-4"><div className="flex gap-2"><Input aria-label={`عنوان القسم ${index + 1}`} value={section.title} onChange={event => setDraft(value => ({ ...value, sections: value.sections.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} /><Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`حذف القسم ${index + 1}`} onClick={() => setDraft(value => ({ ...value, sections: value.sections.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button></div><Textarea aria-label={`محتوى القسم ${index + 1}`} rows={4} value={section.body} onChange={event => setDraft(value => ({ ...value, sections: value.sections.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item) }))} /></div>)}</div>
      <div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="outline" onClick={() => setDraft(cloneInformationPageContent(informationPages[slug]))}>استعادة النص الحالي من الكود</Button><Button onClick={() => void save()} disabled={saving}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ الصفحة"}</Button></div></CardContent></Card>
  </div>;
}
