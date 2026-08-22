import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, BookOpen, Check, Landmark, MapPin, ShieldCheck, Smartphone, Truck, Wallet } from "lucide-react";
import { getGetCartQueryKey, getGetMyOrdersQueryKey, getListCustomerAddressesQueryKey, getListGovernorateCitiesQueryKey, useCreateOrder, useGetCart, useGetShippingQuote, useListCustomerAddresses, useListGovernorateCities, useListGovernorates } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/storefront/Seo";
import { type ProductNotice, useProductNotice } from "@/components/storefront/ProductNoticeModal";
import { normalizeEgyptianPhone } from "@workspace/api-zod";
import { trackCommerceEvent } from "@/lib/analytics";
import { getManualPaymentSettings } from "@/lib/manual-payments";
import { GovernorateCombobox } from "@/components/storefront/GovernorateCombobox";
import { CityCombobox } from "@/components/storefront/CityCombobox";

const requiredPhone = z.string().transform((value, context) => {
  const normalized = normalizeEgyptianPhone(value);
  if (!normalized) { context.addIssue({ code: z.ZodIssueCode.custom, message: "رقم موبايل مصري غير صحيح" }); return z.NEVER; }
  return normalized;
});
const optionalPhone = z.string().transform((value, context) => {
  if (!value.trim()) return "";
  const normalized = normalizeEgyptianPhone(value);
  if (!normalized) { context.addIssue({ code: z.ZodIssueCode.custom, message: "رقم موبايل مصري غير صحيح" }); return z.NEVER; }
  return normalized;
});
const schema = z.object({
  customerName: z.string().trim().min(2, "اكتب الاسم الكامل"), mobile: requiredPhone, primaryPhoneHasWhatsApp: z.boolean(), altMobile: optionalPhone, alternatePhoneHasWhatsApp: z.boolean(), preferredWhatsApp: z.enum(["primary", "alternate", "none"]),
  governorateId: z.coerce.number().int().positive("اختر المحافظة"), city: z.string().trim().min(2, "اختر أو اكتب المدينة"), detailedAddress: z.string().trim().min(5, "اكتب العنوان بالتفصيل"), landmark: z.string().optional(), deliveryNotes: z.string().optional(), orderNotes: z.string().optional(),
  paymentMethod: z.literal("manual_transfer"), paymentPlan: z.enum(["deposit_100", "full"]), transferMethod: z.enum(["instapay", "mobile_wallet"]),
}).superRefine((values, context) => {
  if (values.preferredWhatsApp === "primary" && !values.primaryPhoneHasWhatsApp) context.addIssue({ code: "custom", path: ["preferredWhatsApp"], message: "حدد أن الرقم الأساسي عليه واتساب" });
  if (values.preferredWhatsApp === "alternate" && (!values.altMobile || !values.alternatePhoneHasWhatsApp)) context.addIssue({ code: "custom", path: ["preferredWhatsApp"], message: "اكتب الرقم البديل وحدد أنه عليه واتساب" });
});
type CheckoutValues = z.infer<typeof schema>;

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { customer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const checkoutToken = useRef(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const { data: cart, isLoading } = useGetCart();
  const { data: governorates } = useListGovernorates();
  const { data: paymentSettings, isLoading: paymentSettingsLoading } = useQuery({ queryKey: ["manual-payment-settings"], queryFn: getManualPaymentSettings, staleTime: 30_000 });
  const { data: addresses } = useListCustomerAddresses({ query: { queryKey: getListCustomerAddressesQueryKey(), enabled: Boolean(customer), retry: false } });
  const form = useForm<CheckoutValues>({ resolver: zodResolver(schema), defaultValues: { customerName: "", mobile: "", primaryPhoneHasWhatsApp: true, altMobile: "", alternatePhoneHasWhatsApp: false, preferredWhatsApp: "primary", city: "", detailedAddress: "", landmark: "", deliveryNotes: "", orderNotes: "", paymentMethod: "manual_transfer", paymentPlan: "deposit_100", transferMethod: "instapay" } });
  const governorateId = form.watch("governorateId");
  const city = form.watch("city");
  const paymentPlan = form.watch("paymentPlan");
  const transferMethod = form.watch("transferMethod");
  const { data: cities } = useListGovernorateCities(governorateId || 0, { query: { queryKey: getListGovernorateCitiesQueryKey(governorateId || 0), enabled: Boolean(governorateId) } });
  const quote = useGetShippingQuote();
  const finalTotal = (cart?.subtotal || 0) - (cart?.couponDiscount || 0) + (quote.data?.finalCost || 0);
  const requiredNow = paymentPlan === "full" ? finalTotal : Math.min(100, finalTotal);
  const remaining = Math.max(0, finalTotal - requiredNow);
  const selectedPaymentSetting = paymentSettings?.find(item => item.method === transferMethod);
  const noticeProduct = (cart?.items as unknown as ProductNotice[] | undefined)?.find(item => item.customerNoticeTrigger === "checkout" || item.customerNoticeTrigger === "first_interaction");
  const checkoutNotice = useProductNotice(noticeProduct);

  useEffect(() => { if (paymentSettings?.length && !paymentSettings.some(item => item.method === form.getValues("transferMethod"))) form.setValue("transferMethod", paymentSettings[0].method); }, [paymentSettings, form]);
  useEffect(() => { if (customer) { form.setValue("customerName", customer.name); form.setValue("mobile", customer.primaryPhone || customer.mobile); form.setValue("primaryPhoneHasWhatsApp", customer.primaryPhoneHasWhatsApp); form.setValue("altMobile", customer.alternatePhone || ""); form.setValue("alternatePhoneHasWhatsApp", customer.alternatePhoneHasWhatsApp); form.setValue("preferredWhatsApp", resolvePreferredWhatsApp(customer.preferredWhatsAppPhone, customer.primaryPhone || customer.mobile, customer.alternatePhone)); } }, [customer, form]);
  useEffect(() => {
    const address = addresses?.find(item => item.isDefault);
    if (address && !form.getValues("detailedAddress")) applyAddressValues(form, address);
  }, [addresses, form]);
  useEffect(() => {
    if (!governorateId || !cart?.items.length) return;
    const timer = window.setTimeout(() => quote.mutate({ data: { governorateId, city: city || undefined, couponCode: cart.couponCode || undefined } }), 250);
    return () => window.clearTimeout(timer);
  }, [governorateId, city, cart?.items.length, cart?.couponCode]);

  const createOrder = useCreateOrder({ mutation: { onSuccess: order => { queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetMyOrdersQueryKey() }); setLocation(`/order-confirmation/${order.orderNumber}`); }, onError: error => toast({ title: "لم يتم إنشاء الطلب", description: error instanceof Error ? error.message : "راجع البيانات ثم حاول مرة أخرى. لن يتكرر الطلب عند إعادة المحاولة.", variant: "destructive" }) } });
  const submit = (values: CheckoutValues) => {
    if (!cart?.items.length || !quote.data) { toast({ title: "انتظر اكتمال حساب الشحن", variant: "destructive" }); return; }
    if (!paymentSettings?.some(item => item.method === values.transferMethod)) { toast({ title: "وسيلة التحويل غير متاحة", variant: "destructive" }); return; }
    const { preferredWhatsApp, ...orderValues } = values;
    trackCommerceEvent("InitiateCheckout", { value: finalTotal, items: cart.items.map(item => ({ id: item.productId, name: item.nameAr || "منتج", price: item.unitPrice, quantity: item.quantity })) });
    checkoutNotice.request("checkout", () => createOrder.mutate({ data: { ...orderValues, altMobile: values.altMobile || null, preferredWhatsAppPhone: preferredWhatsApp === "primary" ? values.mobile : preferredWhatsApp === "alternate" ? values.altMobile || null : null, checkoutToken: checkoutToken.current, couponCode: cart.couponCode || null } }));
  };
  const applyAddress = (id: number) => { const address = addresses?.find(item => item.id === id); if (address) applyAddressValues(form, address); };

  if (isLoading) return <div className="container mx-auto grid gap-8 px-4 py-10 lg:grid-cols-3"><Skeleton className="h-[650px] rounded-3xl lg:col-span-2" /><Skeleton className="h-[500px] rounded-3xl" /></div>;
  if (!cart?.items.length) return <div className="container mx-auto px-4 py-24 text-center"><BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" /><h1 className="text-2xl font-black">سلتك فارغة</h1><Button className="mt-6" asChild><Link href="/catalog">ابدأ التسوق</Link></Button></div>;

  return <div className="min-h-screen bg-slate-50/70 py-6 sm:py-8"><Seo title="إتمام الطلب | مكتبة دوت كوم" description="أدخل بيانات التوصيل واختر قيمة ووسيلة التحويل لتأكيد طلبك." /><div className="container mx-auto px-3 sm:px-4"><div className="mb-6 flex items-center gap-3"><Button variant="ghost" size="icon" asChild><Link href="/cart" aria-label="العودة إلى السلة"><ArrowRight className="h-5 w-5" /></Link></Button><div><h1 className="text-2xl font-black sm:text-3xl">إتمام الطلب</h1><p className="text-sm text-muted-foreground">الحساب اختياري — يمكنك إتمام الطلب كضيف</p></div></div>
    <div className="mb-6 grid grid-cols-4 gap-2 rounded-2xl border bg-white p-3 text-center text-[11px] sm:text-sm">{["بياناتك", "العنوان", "الدفع", "المراجعة"].map((label, index) => <div key={label} className="flex min-w-0 flex-col items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary font-bold text-white">{index + 1}</span><span className="truncate font-bold">{label}</span></div>)}</div>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="grid gap-7 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {addresses?.length ? <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">عنوان محفوظ</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">{addresses.map(address => <button type="button" key={address.id} onClick={() => applyAddress(address.id)} className="rounded-xl border p-3 text-right text-sm transition hover:border-secondary hover:bg-sky-50"><strong className="block">{address.governorate} - {address.city}</strong><span className="text-muted-foreground">{address.detailedAddress}</span>{address.isDefault && <span className="mr-2 text-xs font-bold text-secondary">الافتراضي</span>}</button>)}</CardContent></Card> : null}
        <Card className="overflow-hidden rounded-2xl"><CardHeader className="border-b bg-white"><CardTitle className="flex gap-2"><MapPin className="h-5 w-5 text-secondary" /> ١. بيانات العميل والعنوان</CardTitle></CardHeader><CardContent className="grid gap-5 p-4 sm:grid-cols-2 sm:p-7">
          <Field form={form} name="customerName" label="الاسم الكامل *" placeholder="الاسم ثلاثي" /><Field form={form} name="mobile" label="رقم الموبايل الأساسي *" placeholder="01xxxxxxxxx" dir="ltr" /><FormField control={form.control} name="primaryPhoneHasWhatsApp" render={({ field }) => <FormItem className="flex items-center gap-3 rounded-xl border p-3"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">الرقم الأساسي عليه واتساب</FormLabel></FormItem>} /><Field form={form} name="altMobile" label="رقم بديل (اختياري)" placeholder="اختياري" dir="ltr" /><FormField control={form.control} name="alternatePhoneHasWhatsApp" render={({ field }) => <FormItem className="flex items-center gap-3 rounded-xl border p-3"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">الرقم البديل عليه واتساب</FormLabel></FormItem>} /><FormField control={form.control} name="preferredWhatsApp" render={({ field }) => <FormItem><FormLabel>رقم واتساب المفضل</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="primary">الرقم الأساسي</SelectItem><SelectItem value="alternate">الرقم البديل</SelectItem><SelectItem value="none">لا يوجد</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
          <FormField control={form.control} name="governorateId" render={({ field }) => <FormItem><FormLabel>المحافظة *</FormLabel><FormControl><GovernorateCombobox governorates={governorates} value={field.value} onChange={value => { field.onChange(value); form.setValue("city", ""); }} /></FormControl><FormMessage /></FormItem>} />
          <FormField control={form.control} name="city" render={({ field }) => <FormItem><FormLabel>المدينة / المركز *</FormLabel><FormControl><CityCombobox cities={cities} value={field.value} onChange={field.onChange} disabled={!governorateId} /></FormControl><FormMessage /></FormItem>} />
          <div className="sm:col-span-2"><Field form={form} name="detailedAddress" label="العنوان بالتفصيل *" placeholder="الشارع، رقم العقار، الدور، الشقة" /></div><Field form={form} name="landmark" label="علامة مميزة" placeholder="بجوار..." /><Field form={form} name="deliveryNotes" label="ملاحظات التوصيل" placeholder="الاتصال قبل الوصول..." />
        </CardContent></Card>

        <Card className="overflow-hidden rounded-2xl"><CardHeader className="border-b"><CardTitle className="flex gap-2"><Wallet className="h-5 w-5 text-secondary" /> ٢. اختر قيمة الدفع</CardTitle></CardHeader><CardContent className="space-y-5 p-4 sm:p-6"><FormField control={form.control} name="paymentPlan" render={({ field }) => <FormItem><FormControl><RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2"><PaymentChoice selected={field.value === "deposit_100"} value="deposit_100" title="دفع 100 جنيه لتأكيد الطلب" description="والباقي نقدًا عند الاستلام" amount={Math.min(100, finalTotal)} /><PaymentChoice selected={field.value === "full"} value="full" title="دفع كامل قيمة الطلب" description="لا يوجد مبلغ عند الاستلام" amount={finalTotal} /></RadioGroup></FormControl><FormMessage /></FormItem>} /><div className="grid gap-3 rounded-2xl bg-slate-950 p-4 text-white sm:grid-cols-3"><Amount label="إجمالي الطلب" value={finalTotal} /><Amount label="المطلوب تحويله الآن" value={requiredNow} accent /><Amount label="المتبقي عند الاستلام" value={remaining} /></div></CardContent></Card>

        <Card className="overflow-hidden rounded-2xl"><CardHeader className="border-b"><CardTitle className="flex gap-2"><Smartphone className="h-5 w-5 text-secondary" /> ٣. اختر وسيلة التحويل</CardTitle></CardHeader><CardContent className="space-y-5 p-4 sm:p-6">{paymentSettingsLoading ? <Skeleton className="h-36 rounded-2xl" /> : paymentSettings?.length ? <FormField control={form.control} name="transferMethod" render={({ field }) => <FormItem><FormControl><RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2">{paymentSettings.map(setting => <label key={setting.method} className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition ${field.value === setting.method ? "border-secondary bg-sky-50" : "border-border bg-white"}`}><RadioGroupItem value={setting.method} /><div><strong className="block">{setting.displayNameAr}</strong><span className="text-xs text-muted-foreground">تحويل يدوي ومراجعة من موظف</span></div></label>)}</RadioGroup></FormControl><FormMessage /></FormItem>} /> : <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">وسائل التحويل غير متاحة حاليًا. تواصل مع المكتبة.</div>}
          {selectedPaymentSetting && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><Landmark className="mt-1 h-5 w-5 text-emerald-700" /><div className="min-w-0"><span className="text-xs text-emerald-800">حوّل إلى</span><strong dir="ltr" className="block break-all text-lg text-emerald-950">{selectedPaymentSetting.transferDestination}</strong>{selectedPaymentSetting.accountHolderName && <p className="text-sm text-emerald-800">باسم: {selectedPaymentSetting.accountHolderName}</p>}{selectedPaymentSetting.instructionsAr && <p className="mt-2 text-xs text-emerald-800">{selectedPaymentSetting.instructionsAr}</p>}</div></div></div>}
          <div><FormField control={form.control} name="orderNotes" render={({ field }) => <FormItem><FormLabel>ملاحظات على الطلب (اختياري)</FormLabel><FormControl><Textarea rows={3} placeholder="أي تفاصيل أخرى..." {...field} /></FormControl><FormMessage /></FormItem>} /></div>
        </CardContent></Card>
      </div>
      <aside><Card className="sticky top-28 overflow-hidden rounded-2xl shadow-lg"><CardHeader className="border-b"><CardTitle>٤. راجع وأكد الطلب</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-64 space-y-4 overflow-y-auto p-5">{cart.items.map(item => <div key={item.productId} className="flex gap-3"><div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">{item.coverImage ? <img src={item.coverImage} alt={item.nameAr} className="h-full w-full object-cover" /> : <BookOpen className="h-full w-full p-3 text-muted-foreground/30" />}</div><div className="min-w-0 flex-1"><strong className="line-clamp-2 text-sm">{item.nameAr}</strong><span className="text-xs text-muted-foreground">{item.quantity} × {item.unitPrice} ج.م</span></div><strong className="text-sm">{item.subtotal} ج.م</strong></div>)}</div><div className="space-y-3 border-t bg-slate-50 p-5 text-sm"><Summary label="المنتجات" value={`${cart.subtotal} ج.م`} />{Boolean(cart.couponDiscount) && <Summary label={`الكوبون ${cart.couponCode || ""}`} value={`-${cart.couponDiscount} ج.م`} green />}<Summary label="الشحن النهائي" value={quote.data ? (quote.data.finalCost === 0 ? "مجانًا" : `${quote.data.finalCost} ج.م`) : governorateId ? "جاري الحساب..." : "اختر المحافظة"} />{quote.data?.freeShippingReason && <p className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">{quote.data.freeShippingReason}</p>}{quote.data && <p className="flex gap-2 text-xs text-muted-foreground"><Truck className="h-4 w-4" /> {quote.data.estimatedDeliveryText || `${quote.data.estimatedDays} أيام عمل تقريبًا`}</p>}<div className="flex items-end justify-between border-t pt-4"><strong>المطلوب الآن</strong><span className="text-2xl font-black text-primary">{requiredNow.toLocaleString("ar-EG")} ج.م</span></div>{remaining > 0 && <Summary label="المتبقي عند الاستلام" value={`${remaining.toLocaleString("ar-EG")} ج.م`} />}</div><div className="p-5"><Button type="submit" disabled={createOrder.isPending || quote.isPending || !quote.data || !paymentSettings?.length} className="h-14 w-full rounded-xl text-base sm:text-lg">{createOrder.isPending ? "جاري تسجيل الطلب..." : "إنشاء الطلب ومتابعة التحويل"}</Button><p className="mt-3 flex items-start justify-center gap-1 text-center text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> لن يعتبر التحويل مدفوعًا إلا بعد مراجعة موظف</p></div></CardContent></Card></aside>
    </form></Form>{checkoutNotice.modal}
  </div></div>;
}

function applyAddressValues(form: ReturnType<typeof useForm<CheckoutValues>>, address: { governorateId?: number | null; city: string; detailedAddress: string; landmark?: string | null; primaryPhone?: string | null; primaryPhoneHasWhatsApp?: boolean; alternatePhone?: string | null; alternatePhoneHasWhatsApp?: boolean; preferredWhatsAppPhone?: string | null }) {
  if (address.governorateId) form.setValue("governorateId", address.governorateId);
  form.setValue("city", address.city); form.setValue("detailedAddress", address.detailedAddress); form.setValue("landmark", address.landmark || "");
  if (address.primaryPhone) form.setValue("mobile", address.primaryPhone);
  form.setValue("primaryPhoneHasWhatsApp", address.primaryPhoneHasWhatsApp ?? true); form.setValue("altMobile", address.alternatePhone || ""); form.setValue("alternatePhoneHasWhatsApp", address.alternatePhoneHasWhatsApp ?? false);
  if (address.preferredWhatsAppPhone) form.setValue("preferredWhatsApp", resolvePreferredWhatsApp(address.preferredWhatsAppPhone, address.primaryPhone, address.alternatePhone));
}
function resolvePreferredWhatsApp(preferred: string | null | undefined, primary: string | null | undefined, alternate: string | null | undefined): "primary" | "alternate" | "none" {
  if (!preferred) return primary ? "primary" : "none";
  return alternate && preferred === alternate ? "alternate" : primary && preferred === primary ? "primary" : "none";
}
function PaymentChoice({ selected, value, title, description, amount }: { selected: boolean; value: "deposit_100" | "full"; title: string; description: string; amount: number }) { return <label className={`relative flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition ${selected ? "border-secondary bg-sky-50 shadow-sm" : "border-border bg-white hover:border-slate-300"}`}><RadioGroupItem className="mt-1" value={value} /><div className="min-w-0"><strong className="block">{title}</strong><p className="mt-1 text-xs text-muted-foreground">{description}</p><span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-sm font-black text-primary shadow-sm">{amount.toLocaleString("ar-EG")} ج.م الآن</span></div>{selected && <Check className="absolute left-3 top-3 h-5 w-5 text-secondary" />}</label>; }
function Amount({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div><span className="text-xs text-slate-400">{label}</span><strong className={`block text-lg ${accent ? "text-amber-300" : ""}`}>{value.toLocaleString("ar-EG")} ج.م</strong></div>; }
function Field({ form, name, label, placeholder, dir }: { form: ReturnType<typeof useForm<CheckoutValues>>; name: keyof CheckoutValues; label: string; placeholder: string; dir?: "ltr" | "rtl" }) { return <FormField control={form.control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input placeholder={placeholder} dir={dir} value={String(field.value ?? "")} onChange={field.onChange} onBlur={field.onBlur} name={field.name} ref={field.ref} /></FormControl><FormMessage /></FormItem>} />; }
function Summary({ label, value, green = false }: { label: string; value: string; green?: boolean }) { return <div className={`flex justify-between gap-3 ${green ? "font-bold text-emerald-700" : ""}`}><span>{label}</span><span className="text-left">{value}</span></div>; }
