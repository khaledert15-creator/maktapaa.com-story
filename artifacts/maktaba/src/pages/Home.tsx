import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { getGetHomepageContentQueryKey, useGetHomepageContent, type ProductSummary } from "@workspace/api-client-react";
import { BookOpen, ChevronLeft, GraduationCap, House, Library, MapPin, PackageCheck, School, ShieldCheck, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductSection } from "@/components/storefront/ProductSection";
import { Seo } from "@/components/storefront/Seo";
import { HeroBanner, type HeroSlide } from "@/components/storefront/HeroBanner";
import { HomeDiscovery } from "@/components/storefront/HomeDiscovery";

export default function Home() {
  const { data, isLoading, isError, refetch } = useGetHomepageContent({
    query: {
      queryKey: getGetHomepageContentQueryKey(),
      staleTime: 30_000,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    },
  });
  const [bannerIndex, setBannerIndex] = useState(0);
  const banners = data?.banners || [];
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = window.setInterval(() => setBannerIndex(index => (index + 1) % banners.length), 6000);
    return () => window.clearInterval(timer);
  }, [banners.length]);
  const banner = banners[bannerIndex];
  const recentlyViewed = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("maktaba_recently_viewed") || "[]") as ProductSummary[]; }
    catch { return []; }
  }, []);
  const homepageLayout = data?.homepageLayout;
  const selectedStages = useMemo(() => orderByIds(data?.stages || [], homepageLayout?.stages.itemIds || []), [data?.stages, homepageLayout?.stages.itemIds]);
  const selectedGrades = useMemo(() => orderByIds(data?.grades || [], homepageLayout?.grades.itemIds || []), [data?.grades, homepageLayout?.grades.itemIds]);
  const selectedSubjects = useMemo(() => orderByIds(data?.subjects || [], homepageLayout?.subjects.itemIds || []), [data?.subjects, homepageLayout?.subjects.itemIds]);

  if (isLoading) return <HomeSkeleton />;
  if (isError || !data) return <div className="container mx-auto px-4 py-24 text-center"><BookOpen className="mx-auto mb-4 h-14 w-14 text-muted-foreground/40" /><h1 className="text-2xl font-black">تعذر تحميل المكتبة</h1><p className="mt-2 text-muted-foreground">تحقق من الاتصال ثم حاول مرة أخرى.</p><Button className="mt-6" onClick={() => refetch()}>إعادة المحاولة</Button></div>;

  return (
    <div className="overflow-hidden pb-10">
      <Seo title={data.settings?.seoTitle || `${data.settings?.storeNameAr || "مكتبة دوت كوم"} | كتبك الدراسية في مكان واحد`} description={data.settings?.seoDescription} />

      {banner && <div className="relative"><HeroBanner slide={banner as HeroSlide} />{banners.length > 1 && <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">{banners.map((item, index) => <button key={item.id} aria-label={`العرض ${index + 1}`} onClick={() => setBannerIndex(index)} className={`h-2.5 rounded-full transition-all ${index === bannerIndex ? "w-8 bg-sky-400" : "w-2.5 bg-white/60"}`} />)}</div>}</div>}

      <section className={`container relative z-10 mx-auto px-4 ${banner ? "-mt-6" : "pt-6"}`}><div className="home-trust-strip grid grid-cols-2 gap-1 rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_18px_50px_-24px_rgba(15,23,42,.35)] backdrop-blur md:grid-cols-4">{[
        [Truck, "شحن لكل مصر", "تسعير واضح حسب منطقتك"], [ShieldCheck, "تحويل يدوي آمن", "مقدم 100 جنيه أو دفع كامل بمراجعة بشرية"], [PackageCheck, "تغليف آمن", "كتبك تصل بحالة ممتازة"], [Library, "بيانات محدثة", "السعر والمخزون لحظيًا"],
      ].map(([Icon, title, text], index) => <div key={String(title)} className="home-trust-item flex items-center gap-3 rounded-2xl p-3 sm:p-4"><div className="shrink-0 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 p-2.5 text-sky-600 ring-1 ring-sky-100"><Icon className="h-5 w-5" /></div><div><div className="text-sm font-extrabold text-slate-900 sm:text-base">{String(title)}</div><div className="hidden text-xs leading-5 text-slate-500 sm:block">{String(text)}</div></div>{index < 3 && <span className="home-trust-divider" aria-hidden="true" />}</div>)}</div></section>

      {homepageLayout && <HomeDiscovery products={data.showcaseProducts || []} teachers={data.teachers || []} grades={data.grades || []} layout={homepageLayout} />}

      <DeliveryJourney>
        {homepageLayout?.stages.enabled && !!selectedStages.length && <ExploreStrip title={homepageLayout.stages.title} subtitle={homepageLayout.stages.subtitle || undefined} href="/stages" items={selectedStages.map(stage => ({ id: stage.id, label: stage.nameAr, href: `/catalog?stageId=${stage.id}`, icon: GraduationCap }))} />}
        {homepageLayout?.grades.enabled && !!selectedGrades.length && <ExploreStrip title={homepageLayout.grades.title} subtitle={homepageLayout.grades.subtitle || undefined} href="/stages" items={selectedGrades.map(grade => ({ id: grade.id, label: grade.nameAr, href: `/catalog?gradeId=${grade.id}`, icon: BookOpen }))} compact />}
        {homepageLayout?.subjects.enabled && !!selectedSubjects.length && <ExploreStrip title={homepageLayout.subjects.title} subtitle={homepageLayout.subjects.subtitle || undefined} href="/stages" items={selectedSubjects.map(subject => ({ id: subject.id, label: subject.nameAr, href: `/catalog?subjectId=${subject.id}`, icon: Library }))} compact />}
      </DeliveryJourney>

      <ProductSection title="الأكثر مبيعًا" subtitle="كتب اختارها طلاب كثيرون" products={data.bestSellers} href="/catalog?sortBy=best_selling" autoRotate />
      <ProductSection title="وصل حديثًا" subtitle="أحدث الإضافات من لوحة الإدارة" products={data.newArrivals} href="/catalog?sortBy=newest" tone="soft" />
      <ProductSection title="عروض تستحق" subtitle="خصومات فعلية على الأسعار الحالية" products={data.offers} href="/offers" />
      <ProductSection title="مراجعات وامتحانات" products={data.revisionBooks} href="/catalog?isRevision=true" tone="soft" />
      <ProductSection title="باقات الكتب" products={data.bundles} href="/catalog?isBundle=true" />
      <ProductSection title="منتجات بشحن مجاني" products={data.freeShippingProducts} href="/catalog?freeShipping=true" tone="soft" />
      <ProductSection title="مقترحة لك" products={data.recommendedProducts?.length ? data.recommendedProducts : data.featuredProducts} href="/catalog?sortBy=recommended" />
      <ProductSection title="شاهدتها مؤخرًا" products={recentlyViewed} />

      {!!data.publishers?.length && <section className="container mx-auto px-4 py-12"><div className="mb-6 text-center"><h2 className="text-3xl font-black">دور النشر</h2><p className="mt-2 text-muted-foreground">اختر دار النشر التي تثق بها</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">{data.publishers.slice(0, 12).map(publisher => <Link key={publisher.id} href={`/publisher/${publisher.id}-${slugify(publisher.nameAr)}`} className="flex min-h-24 items-center justify-center rounded-2xl border bg-white p-4 text-center font-extrabold transition hover:-translate-y-1 hover:border-secondary hover:shadow-lg">{publisher.logo ? <img src={publisher.logo} alt={publisher.nameAr} loading="lazy" decoding="async" width="220" height="100" className="max-h-14 max-w-full object-contain" /> : publisher.nameAr}</Link>)}</div></section>}
    </div>
  );
}

function ExploreStrip({ title, subtitle, items, href, compact = false }: { title: string; subtitle?: string; items: { id: number; label: string; href: string; icon: typeof BookOpen }[]; href?: string; compact?: boolean }) {
  const layout = compact
    ? items.length === 5 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
    : items.length === 2 ? "mx-auto max-w-4xl grid-cols-1 sm:grid-cols-2" : "grid-cols-2 md:grid-cols-4";
  return <section className="container relative z-10 mx-auto px-4 py-8 sm:py-10"><div className="mb-5 flex items-end justify-between gap-4"><div><span className="mb-2 block h-1 w-10 rounded-full bg-sky-500" /><h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h2>{subtitle && <p className="mt-1.5 text-sm text-slate-500 sm:text-base">{subtitle}</p>}</div>{href && <Link href={href} className="group flex shrink-0 items-center gap-1 rounded-full border border-sky-100 bg-white/80 px-3 py-2 text-sm font-bold text-sky-600 shadow-sm backdrop-blur transition hover:border-sky-300 hover:bg-sky-50">عرض الكل <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /></Link>}</div><div className={`grid gap-3 sm:gap-4 ${layout}`}>{items.slice(0, compact ? 12 : 8).map(item => <Link key={item.id} href={item.href} className="group"><Card className="h-full rounded-2xl border-slate-200/80 bg-white/90 shadow-[0_8px_24px_-20px_rgba(15,23,42,.5)] backdrop-blur transition duration-300 group-hover:-translate-y-1 group-hover:border-sky-300 group-hover:shadow-[0_18px_32px_-20px_rgba(2,132,199,.45)]"><CardContent className={`flex items-center gap-3 ${compact ? "p-4" : "p-5 sm:p-6"}`}><div className="rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 p-2.5 text-sky-600 ring-1 ring-sky-100 transition duration-300 group-hover:scale-105 group-hover:bg-sky-100"><item.icon className="h-5 w-5" /></div><span className="font-extrabold text-slate-900">{item.label}</span></CardContent></Card></Link>)}</div></section>;
}

function DeliveryJourney({ children }: { children: ReactNode }) {
  return <div className="delivery-journey relative isolate overflow-hidden">
    <div className="delivery-route delivery-route-one" aria-hidden="true" />
    <div className="delivery-route delivery-route-two" aria-hidden="true" />
    <div className="delivery-map" aria-hidden="true">
      <span className="delivery-map-node delivery-map-store"><Store /><i>تجهيز الكتب</i></span>
      <span className="delivery-map-node delivery-map-pin-one"><MapPin /></span>
      <span className="delivery-map-node delivery-map-school"><School /><i>المدرسة</i></span>
      <span className="delivery-map-node delivery-map-pin-two"><MapPin /></span>
      <span className="delivery-map-node delivery-map-home"><House /><i>باب البيت</i></span>
    </div>
    <CourierTrack />
    <CourierTrack reverse />
    {children}
  </div>;
}

function CourierTrack({ reverse = false }: { reverse?: boolean }) {
  return <div className={`delivery-courier-track ${reverse ? "delivery-courier-track-reverse" : ""}`} aria-hidden="true">
      <span className="delivery-speed-lines" />
      <span className="delivery-dust delivery-dust-one" />
      <span className="delivery-dust delivery-dust-two" />
      <img src="/brand/library-delivery-rider.png" alt="" width="1536" height="1024" decoding="async" className="delivery-courier-image" />
    </div>;
}

function HomeSkeleton() {
  return <div className="space-y-10 pb-12"><Skeleton className="h-[440px] w-full rounded-none" /><div className="container mx-auto grid grid-cols-2 gap-4 px-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><div className="container mx-auto px-4"><Skeleton className="mb-6 h-9 w-64" /><div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-96 rounded-2xl" />)}</div></div></div>;
}

function slugify(value: string) { return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, ""); }

function orderByIds<T extends { id: number }>(items: T[], ids: number[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  return ids.flatMap(id => byId.get(id) ? [byId.get(id)!] : []);
}
