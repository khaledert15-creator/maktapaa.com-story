import { useState } from "react";
import { Check, Search, ShieldCheck, Star, X } from "lucide-react";
import { Link } from "wouter";
import { AdminPageState } from "@/components/admin/AdminPageState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { adminApi, useAdminResource } from "@/lib/admin-api";

type ReviewStatus = "pending" | "approved" | "rejected";
type Review = { id: number; productId: number; productName: string; productSlug: string; customerName: string; rating: number; comment?: string | null; moderationStatus: ReviewStatus; verifiedPurchase: boolean; createdAt: string };
type ReviewsResponse = { items: Review[]; total: number; page: number; limit: number };

const statusLabels: Record<ReviewStatus, string> = { pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض" };

export default function AdminReviews() {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const resource = useAdminResource<ReviewsResponse>(`/api/admin/reviews?status=${status}&page=${page}&limit=20&q=${encodeURIComponent(query)}`);
  const { toast } = useToast();
  const [savingId, setSavingId] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil((resource.data?.total || 0) / 20));

  const moderate = async (review: Review, moderationStatus: "approved" | "rejected") => {
    setSavingId(review.id);
    try {
      await adminApi(`/api/admin/reviews/${review.id}`, { method: "PATCH", body: JSON.stringify({ moderationStatus }) });
      toast({ title: moderationStatus === "approved" ? "تم اعتماد التقييم" : "تم رفض التقييم" });
      await resource.reload();
    } catch (error) {
      toast({ title: "تعذر تحديث التقييم", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setSavingId(null); }
  };

  return <section className="space-y-6" dir="rtl">
    <div><h1 className="text-2xl font-bold">مراجعات المنتجات</h1><p className="text-sm text-muted-foreground">لا يظهر أي تقييم جديد في المتجر قبل اعتماده من موظف مصرح له.</p></div>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <Tabs value={status} onValueChange={value => { setStatus(value as ReviewStatus); setPage(1); }}><TabsList className="h-auto flex-wrap"><TabsTrigger value="pending">قيد المراجعة</TabsTrigger><TabsTrigger value="approved">المعتمدة</TabsTrigger><TabsTrigger value="rejected">المرفوضة</TabsTrigger></TabsList></Tabs>
      <form className="flex w-full max-w-md gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(searchInput.trim()); }}><Input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="ابحث بالمنتج أو العميل أو نص التقييم" /><Button type="submit" variant="outline" aria-label="بحث"><Search className="h-4 w-4" /></Button></form>
    </div>
    <AdminPageState loading={resource.loading} error={resource.error} empty={!resource.data?.items.length} onRetry={() => void resource.reload()}>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>المنتج</TableHead><TableHead>العميل</TableHead><TableHead>التقييم</TableHead><TableHead className="min-w-64">نص المراجعة</TableHead><TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead><TableHead>الإجراءات</TableHead></TableRow></TableHeader><TableBody>{resource.data?.items.map(review => <TableRow key={review.id}><TableCell><Link href={`/product/${review.productSlug}`} target="_blank" className="font-medium text-primary hover:underline">{review.productName}</Link></TableCell><TableCell><span>{review.customerName}</span>{review.verifiedPurchase && <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />عملية شراء مؤكدة</div>}</TableCell><TableCell><div className="flex items-center gap-1" aria-label={`${review.rating} من 5`}><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><strong>{review.rating}/5</strong></div></TableCell><TableCell className="max-w-md whitespace-normal leading-6">{review.comment || <span className="text-muted-foreground">بدون تعليق</span>}</TableCell><TableCell className="whitespace-nowrap">{new Date(review.createdAt).toLocaleDateString("ar-EG")}</TableCell><TableCell><Badge variant={review.moderationStatus === "rejected" ? "destructive" : review.moderationStatus === "approved" ? "default" : "secondary"}>{statusLabels[review.moderationStatus]}</Badge></TableCell><TableCell><div className="flex gap-2">{review.moderationStatus !== "approved" && <Button size="sm" onClick={() => void moderate(review, "approved")} disabled={savingId === review.id}><Check className="ml-1 h-4 w-4" />اعتماد</Button>}{review.moderationStatus !== "rejected" && <Button size="sm" variant="outline" onClick={() => void moderate(review, "rejected")} disabled={savingId === review.id}><X className="ml-1 h-4 w-4" />رفض</Button>}</div></TableCell></TableRow>)}</TableBody></Table></div></Card>
    </AdminPageState>
    {(resource.data?.total || 0) > 20 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>السابق</Button><span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>التالي</Button></div>}
    {!resource.loading && <Card><CardContent className="py-3 text-sm text-muted-foreground">إجمالي النتائج: {resource.data?.total || 0}</CardContent></Card>}
  </section>;
}
