import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AdminPageState({ loading, error, empty, onRetry, children }: {
  loading: boolean;
  error?: string;
  empty: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) return <Card><CardContent className="flex min-h-44 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />جاري تحميل البيانات...</CardContent></Card>;
  if (error) return <Card className="border-destructive/30"><CardContent className="flex min-h-44 flex-col items-center justify-center text-center"><AlertCircle className="mb-3 h-8 w-8 text-destructive" /><p className="font-bold">تعذر تحميل البيانات</p><p className="mt-1 text-sm text-muted-foreground">{error}</p>{onRetry && <Button className="mt-4" variant="outline" onClick={onRetry}>إعادة المحاولة</Button>}</CardContent></Card>;
  if (empty) return <Card><CardContent className="flex min-h-44 flex-col items-center justify-center text-center text-muted-foreground"><Inbox className="mb-3 h-8 w-8" /><p>لا توجد بيانات مطابقة حاليًا</p></CardContent></Card>;
  return <>{children}</>;
}
