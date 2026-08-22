import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Copy,
  ImagePlus,
  MessageCircle,
  Package,
  ShieldCheck,
  Truck,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import {
  getGetOrderConfirmationQueryKey,
  useGetOrderConfirmation,
  useGetSiteSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  OrderTimeline,
  orderStatusLabels,
} from "@/components/storefront/OrderTimeline";
import { Seo } from "@/components/storefront/Seo";
import { isAnalyticsEnabled, trackCommerceEvent } from "@/lib/analytics";
import {
  getManualPaymentSettings,
  getOrderPaymentAttempts,
  submitOrderPaymentAttempt,
} from "@/lib/manual-payments";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const paymentStatusLabels: Record<string, string> = {
  awaiting_transfer: "بانتظار تسجيل التحويل",
  pending_verification: "في انتظار مراجعة التحويل",
  partially_paid: "تم تأكيد المقدم",
  fully_paid: "مدفوع بالكامل",
  rejected: "التحويل مرفوض — يمكنك إرسال بيانات جديدة",
  needs_review: "يحتاج مراجعة إضافية",
  cash_on_delivery: "دفع عند الاستلام (طلب سابق)",
};

export default function OrderConfirmation() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { customer } = useAuth();
  const [senderIdentifier, setSenderIdentifier] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [orderNumberCopied, setOrderNumberCopied] = useState(false);
  const {
    data: order,
    isLoading,
    isError,
  } = useGetOrderConfirmation(orderNumber, {
    query: {
      queryKey: getGetOrderConfirmationQueryKey(orderNumber),
      retry: false,
    },
  });
  const { data: siteSettings } = useGetSiteSettings();
  const { data: settings } = useQuery({
    queryKey: ["manual-payment-settings"],
    queryFn: getManualPaymentSettings,
    staleTime: 30_000,
  });
  const attemptsQuery = useQuery({
    queryKey: ["order-payment-attempts", orderNumber],
    queryFn: () => getOrderPaymentAttempts(orderNumber),
    enabled: Boolean(orderNumber && order?.paymentMethod === "manual_transfer"),
    retry: false,
  });
  const selectedSetting = settings?.find(
    (item) => item.method === order?.transferMethod,
  );
  const latestAttempt = attemptsQuery.data?.[0];
  const canSubmit =
    order?.paymentMethod === "manual_transfer" &&
    ["awaiting_transfer", "rejected"].includes(order.paymentStatus);
  const requiredAmount = order?.requiredPaymentAmount ?? order?.total ?? 0;
  const paidAmount = order?.paidAmount ?? 0;
  const remainingAmount = order?.remainingAmount ?? order?.total ?? 0;
  const copyOrderNumber = async () => {
    await navigator.clipboard.writeText(orderNumber);
    setOrderNumberCopied(true);
    window.setTimeout(() => setOrderNumberCopied(false), 1800);
  };
  const whatsappUrl = useMemo(() => {
    const storeNumber = (
      siteSettings?.whatsappNumber || "201000000000"
    ).replace(/\D/g, "");
    if (!order) return `https://wa.me/${storeNumber}`;
    const books = order.items
      .map(
        (item) => `• ${item.nameAr} — ${item.quantity} × ${item.unitPrice} ج.م`,
      )
      .join("\n");
    const message = [
      "مرحبًا مكتبة دوت كوم 👋",
      `سعدت بتسجيل طلبي رقم ${order.orderNumber}`,
      `الاسم: ${order.customerName}`,
      "",
      "الكتب:",
      books,
      `إجمالي الطلب: ${order.total} ج.م`,
      `طريقة الدفع: ${order.paymentPlan === "full" ? "دفع المبلغ كاملًا الآن" : "دفع الباقي عند الاستلام"}`,
      `المطلوب لتأكيد الطلب: ${requiredAmount} ج.م`,
      order.paymentPlan === "full"
        ? "لا يوجد مبلغ متبقٍ عند الاستلام"
        : `المتبقي عند الاستلام: ${remainingAmount} ج.م`,
      "",
      "أحب أكمل تأكيد الطلب ومعرفة بيانات التحويل المناسبة، شكرًا لكم.",
    ].join("\n");
    return `https://wa.me/${storeNumber}?text=${encodeURIComponent(message)}`;
  }, [siteSettings?.whatsappNumber, order, requiredAmount, remainingAmount]);

  useEffect(() => {
    if (!proof) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(proof);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);
  useEffect(() => {
    if (!order || !isAnalyticsEnabled()) return;
    const key = `maktaba_purchase_tracked_${order.orderNumber}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* Analytics must never block confirmation. */
    }
    trackCommerceEvent("Purchase", {
      orderNumber: order.orderNumber,
      value: order.total,
      items: order.items.map((item) => ({
        id: item.productId || item.nameAr,
        name: item.nameAr,
        price: item.unitPrice,
        quantity: item.quantity,
      })),
    });
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* Private storage restrictions are non-fatal. */
    }
  }, [order]);

  const submitPayment = useMutation({
    mutationFn: async () => {
      if (!senderIdentifier.trim())
        throw new Error("اكتب الرقم أو الحساب المحول منه");
      const body = new FormData();
      body.set("senderIdentifier", senderIdentifier.trim());
      body.set("amount", String(requiredAmount));
      if (transactionReference.trim())
        body.set("transactionReference", transactionReference.trim());
      if (proof) body.set("proofImage", proof, proof.name);
      return submitOrderPaymentAttempt(orderNumber, body);
    },
    onSuccess: async () => {
      toast({
        title: "تم استلام بيانات التحويل بنجاح ✅",
        description: "سيتم مراجعة التحويل بواسطة فريق مكتبة دوت كوم.",
      });
      setSenderIdentifier("");
      setTransactionReference("");
      setProof(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetOrderConfirmationQueryKey(orderNumber),
        }),
        queryClient.invalidateQueries({
          queryKey: ["order-payment-attempts", orderNumber],
        }),
      ]);
    },
    onError: (error) =>
      toast({
        title: "تعذر إرسال بيانات التحويل",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    submitPayment.mutate();
  };
  const selectProof = (file: File | undefined) => {
    if (!file) {
      setProof(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "صيغة الصورة غير مدعومة",
        description: "استخدم JPG أو JPEG أو PNG أو WEBP.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "الصورة أكبر من 5 ميجابايت", variant: "destructive" });
      return;
    }
    setProof(file);
  };

  if (isLoading)
    return (
      <div className="container mx-auto max-w-3xl space-y-5 px-4 py-16">
        <Skeleton className="mx-auto h-24 w-24 rounded-full" />
        <Skeleton className="mx-auto h-12 w-96 max-w-full" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    );
  if (isError || !order)
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
        <h1 className="text-2xl font-black">تعذر فتح تفاصيل هذا الطلب</h1>
        <p className="mt-2 text-muted-foreground">
          تفاصيل طلب الضيف متاحة من نفس المتصفح الذي أنشأ الطلب.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/track">تتبع الطلب برقم الهاتف</Link>
        </Button>
      </div>
    );
  const manualPayment = order.paymentMethod === "manual_transfer";
  const autoAccountCreated = sessionStorage.getItem("maktaba-auto-account-order") === order.orderNumber;

  return (
    <div className="container mx-auto max-w-5xl px-3 py-10 sm:px-4 sm:py-14">
      <Seo
        title={`تم استلام الطلب ${order.orderNumber} | مكتبة دوت كوم`}
        description="تأكيد طلبك وتسجيل بيانات التحويل للمراجعة."
      />
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 sm:h-24 sm:w-24">
          <CheckCircle2 className="h-12 w-12 sm:h-14 sm:w-14" />
        </div>
        <h1 className="mt-5 text-3xl font-black sm:text-4xl">
          تم استلام طلبك بنجاح 🎉
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          {manualPayment
            ? "طلبك محفوظ، ونكمل معك خطوة التأكيد بسهولة عبر واتساب."
            : "هذا طلب سابق بنظام الدفع عند الاستلام."}
        </p>
      </div>
      <Card className="mt-8 overflow-hidden rounded-3xl shadow-lg">
        <div className="grid gap-4 bg-slate-950 p-4 text-white sm:grid-cols-[1.45fr_1fr_1fr_1fr] sm:p-6">
          <div className="rounded-2xl border border-sky-400/40 bg-sky-400/10 p-4 ring-1 ring-inset ring-white/5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-sky-200">رقم طلبك</span>
              <Button type="button" variant="ghost" size="sm" onClick={copyOrderNumber} className="h-8 rounded-lg px-2 text-xs text-white hover:bg-white/10 hover:text-white">
                {orderNumberCopied ? <CheckCircle2 className="ml-1 h-4 w-4 text-emerald-300" /> : <Copy className="ml-1 h-4 w-4" />}
                {orderNumberCopied ? "تم النسخ" : "نسخ الرقم"}
              </Button>
            </div>
            <strong className="mt-2 block break-all text-left font-mono text-2xl font-black tracking-wide text-white sm:text-3xl" dir="ltr">{order.orderNumber}</strong>
            <span className="mt-2 block text-xs text-slate-300">احتفظ به للمتابعة والاستفسار</span>
          </div>
          <SummaryBlock
            label="حالة الطلب"
            value={orderStatusLabels[order.status] || order.status}
          />
          <SummaryBlock
            label="حالة الدفع"
            value={
              paymentStatusLabels[order.paymentStatus] || order.paymentStatus
            }
          />
          <SummaryBlock
            label="الإجمالي"
            value={`${order.total.toLocaleString("ar-EG")} ج.م`}
          />
        </div>
        {manualPayment && (
          <div className="grid gap-3 border-b bg-amber-50 p-4 sm:grid-cols-3 sm:p-6">
            <Money label="المطلوب تحويله الآن" value={requiredAmount} accent />
            <Money label="تم اعتماده" value={paidAmount} />
            <Money label="المتبقي عند الاستلام" value={remainingAmount} />
          </div>
        )}
        <CardContent className="grid gap-8 p-4 md:grid-cols-2 md:p-8">
          <div>
            <h2 className="mb-5 text-xl font-black">الكتب المطلوبة</h2>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div
                  key={`${item.productId}-${item.nameAr}`}
                  className="flex items-center gap-3"
                >
                  <div className="h-16 w-12 overflow-hidden rounded-lg bg-muted">
                    {item.coverImage ? (
                      <img
                        src={item.coverImage}
                        alt={item.nameAr}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-full w-full p-3 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="line-clamp-2 text-sm">
                      {item.nameAr}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {item.quantity} × {item.unitPrice} ج.م
                    </span>
                  </div>
                  <strong>{item.subtotal} ج.م</strong>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2 border-t pt-5 text-sm">
              <Row label="المنتجات" value={`${order.subtotal} ج.م`} />
              <Row
                label="الشحن"
                value={
                  order.shippingCost === 0
                    ? "مجانًا"
                    : `${order.shippingCost} ج.م`
                }
              />
              {order.freeShippingReason && (
                <p className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  {order.freeShippingReason}
                </p>
              )}
              <Row label="الإجمالي" value={`${order.total} ج.م`} strong />
            </div>
          </div>
          <div>
            <h2 className="mb-5 text-xl font-black">تحديثات الطلب</h2>
            <OrderTimeline history={order.statusHistory} />
            <div className="mt-7 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <p className="flex gap-2">
                <Truck className="h-5 w-5 text-secondary" />
                <span>
                  <strong className="block">عنوان التوصيل</strong>
                  {order.governorate}، {order.city}، {order.detailedAddress}
                </span>
              </p>
              <p className="flex gap-2">
                <Wallet className="h-5 w-5 text-secondary" />
                <span>
                  <strong className="block">طريقة الدفع</strong>
                  {manualPayment
                    ? order.paymentPlan === "full"
                      ? "دفع كامل مقدمًا"
                      : `${requiredAmount.toLocaleString("ar-EG")} ج.م لتأكيد الطلب والباقي عند الاستلام`
                    : "دفع عند الاستلام — طلب سابق"}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {autoAccountCreated && customer && (
        <Card className="mt-5 overflow-hidden rounded-2xl border-sky-200 bg-sky-50/70">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky-100 text-secondary"><ShieldCheck className="h-5 w-5" /></div>
              <div><h2 className="font-black text-primary">جهّزنا لك حسابًا تلقائيًا</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">حفظنا بياناتك وعنوانك لتكون طلباتك القادمة أسرع، وتقدر تراجع أو تعدّل أي بيانات في الوقت المناسب لك.</p></div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" asChild><Link href="/account">مراجعة بياناتي</Link></Button>
              <Button variant="secondary" className="text-white" asChild><Link href="/register?complete=1">تأمين الحساب</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {manualPayment && (
        <Card className="mt-7 overflow-hidden rounded-3xl border-2 border-emerald-100 bg-gradient-to-l from-emerald-50 to-white">
          <CardContent className="p-5 text-center sm:p-7">
            <MessageCircle className="mx-auto h-10 w-10 text-[#20b85a]" />
            <h2 className="mt-3 text-2xl font-black">
              نكمل التأكيد معًا على واتساب
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              جهّزنا لك رسالة فيها رقم الطلب والكتب والمبلغ المطلوب. افتحها،
              وسنساعدك ببيانات التحويل المناسبة حتى يتأكد طلبك بسهولة.
            </p>
            <Button
              size="lg"
              className="mt-5 h-14 w-full rounded-xl bg-[#20b85a] text-base text-white hover:bg-[#189b4a] sm:w-auto sm:px-10"
              asChild
            >
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="ml-2 h-5 w-5" /> نكمل تأكيد الطلب على
                واتساب
              </a>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              الرسالة جاهزة بالتفاصيل — راجعها واضغط إرسال عندما تكون مستعدًا.
            </p>
          </CardContent>
        </Card>
      )}

      {manualPayment && (
        <Card className="mt-7 overflow-hidden rounded-3xl border-2 border-sky-100">
          <CardHeader className="border-b bg-sky-50">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-secondary" /> أو سجّل التحويل هنا
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-7">
            {latestAttempt && !canSubmit ? (
              <PaymentState
                status={order.paymentStatus}
                rejectionReason={latestAttempt.rejectionReason}
              />
            ) : null}
            {canSubmit && (
              <form
                onSubmit={submit}
                className="grid gap-6 lg:grid-cols-[1fr_300px]"
              >
                <div className="space-y-5">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <span className="text-xs text-emerald-800">
                      التحويل عبر{" "}
                      {selectedSetting?.displayNameAr || order.transferMethod}
                    </span>
                    <strong
                      dir="ltr"
                      className="block break-all text-xl text-emerald-950"
                    >
                      {selectedSetting?.transferDestination ||
                        "راجع بيانات التحويل مع المكتبة"}
                    </strong>
                    {selectedSetting?.accountHolderName && (
                      <p className="text-sm text-emerald-800">
                        باسم: {selectedSetting.accountHolderName}
                      </p>
                    )}
                  </div>
                  {latestAttempt?.status === "rejected" && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                      <strong>سبب الرفض السابق:</strong>{" "}
                      {latestAttempt.rejectionReason || "راجع فريق المكتبة"}
                    </div>
                  )}
                  <div>
                    <Label htmlFor="sender-identifier">
                      الرقم أو الحساب المحول منه{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="sender-identifier"
                      className="mt-2 h-12"
                      dir="ltr"
                      value={senderIdentifier}
                      onChange={(event) =>
                        setSenderIdentifier(event.target.value)
                      }
                      placeholder="رقم المحفظة أو حساب/معرف InstaPay"
                      required
                      minLength={3}
                      maxLength={200}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      نستخدمه لمطابقة التحويل فقط، ولا يعني إدخاله أن الدفع تم
                      تأكيده.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="transfer-amount">المبلغ المحول *</Label>
                      <Input
                        id="transfer-amount"
                        className="mt-2 h-12"
                        dir="ltr"
                        readOnly
                        value={requiredAmount.toFixed(2)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="transaction-reference">
                        رقم العملية (اختياري)
                      </Label>
                      <Input
                        id="transaction-reference"
                        className="mt-2 h-12"
                        dir="ltr"
                        value={transactionReference}
                        onChange={(event) =>
                          setTransactionReference(event.target.value)
                        }
                        placeholder="Transaction Reference"
                        maxLength={200}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="proof-image">
                    صورة إثبات التحويل (اختياري)
                  </Label>
                  <label
                    htmlFor="proof-image"
                    className="mt-2 grid min-h-56 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-slate-50 p-3 text-center transition hover:border-secondary"
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt="معاينة إثبات التحويل"
                        className="max-h-64 w-full rounded-xl object-contain"
                      />
                    ) : (
                      <span>
                        <ImagePlus className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                        <strong className="block">اختر صورة</strong>
                        <small className="text-muted-foreground">
                          JPG، PNG، WEBP — حتى 5MB
                        </small>
                      </span>
                    )}
                  </label>
                  <input
                    id="proof-image"
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => selectProof(event.target.files?.[0])}
                  />
                  {proof && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => setProof(null)}
                    >
                      <X className="ml-1 h-4 w-4" />
                      إزالة الصورة
                    </Button>
                  )}
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    إرفاق الصورة اختياري، لكنه يساعد في سرعة مراجعة الدفع.
                  </p>
                </div>
                <div className="lg:col-span-2">
                  <Button
                    type="submit"
                    disabled={
                      submitPayment.isPending || !senderIdentifier.trim()
                    }
                    className="h-14 w-full rounded-xl text-lg"
                  >
                    <Upload className="ml-2 h-5 w-5" />
                    {submitPayment.isPending
                      ? "جاري إرسال البيانات..."
                      : "إرسال بيانات التحويل للمراجعة"}
                  </Button>
                  <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    حالة الدفع بعد الإرسال: في انتظار مراجعة التحويل
                  </p>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/catalog">متابعة التسوق</Link>
        </Button>
        <Button asChild>
          <Link
            href={`/track?orderNumber=${encodeURIComponent(order.orderNumber)}&mobile=${encodeURIComponent(order.mobile || "")}`}
          >
            تتبع الطلب
          </Link>
        </Button>
        {customer && order.id && (
          <Button variant="secondary" className="text-white" asChild>
            <Link href={`/orders/${order.id}`}>تفاصيل الطلب</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function PaymentState({
  status,
  rejectionReason,
}: {
  status: string;
  rejectionReason?: string | null;
}) {
  const style =
    status === "rejected"
      ? "border-red-200 bg-red-50 text-red-900"
      : status === "fully_paid" || status === "partially_paid"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className={`mb-5 rounded-2xl border p-5 ${style}`}>
      <div className="flex items-start gap-3">
        {status === "fully_paid" || status === "partially_paid" ? (
          <CheckCircle2 className="h-6 w-6 shrink-0" />
        ) : (
          <Clock3 className="h-6 w-6 shrink-0" />
        )}
        <div>
          <strong className="block text-lg">
            {paymentStatusLabels[status] || status}
          </strong>
          {status === "pending_verification" && (
            <p className="text-sm">
              تم استلام بيانات التحويل بنجاح ✅ وسيتم مراجعتها بواسطة فريق مكتبة
              دوت كوم.
            </p>
          )}
          {status === "needs_review" && (
            <p className="text-sm">
              فريق المكتبة يراجع بيانات التحويل، وقد يتواصل معك عند الحاجة.
            </p>
          )}
          {status === "rejected" && rejectionReason && (
            <p className="text-sm">السبب: {rejectionReason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
function SummaryBlock({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-slate-400">{label}</span>
      <strong
        className="block text-base sm:text-lg"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </strong>
    </div>
  );
}
function Money({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-amber-900/70">{label}</span>
      <strong
        className={`block text-xl ${accent ? "text-amber-700" : "text-slate-950"}`}
      >
        {value.toLocaleString("ar-EG")} ج.م
      </strong>
    </div>
  );
}
function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "border-t pt-3 text-lg font-black" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
