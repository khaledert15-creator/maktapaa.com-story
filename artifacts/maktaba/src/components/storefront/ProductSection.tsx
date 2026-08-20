import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductSummary } from "@workspace/api-client-react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./ProductCard";

type ProductSectionProps = {
  title: string;
  subtitle?: string;
  products?: ProductSummary[];
  href?: string;
  tone?: "plain" | "soft";
  autoRotate?: boolean;
  rotationInterval?: number;
};

export function ProductSection({
  title,
  subtitle,
  products,
  href = "/catalog",
  tone = "plain",
  autoRotate = false,
  rotationInterval = 5_500,
}: ProductSectionProps) {
  const visibleProducts = products?.slice(0, 10) || [];
  if (!visibleProducts.length) return null;

  return (
    <section className={`product-section-ambient ${tone === "soft" ? "product-section-ambient-soft border-y border-slate-100 bg-slate-50/75 py-10 sm:py-12" : "py-8 sm:py-10"}`}>
      <span className="product-section-glow product-section-glow-one" aria-hidden="true" />
      <span className="product-section-glow product-section-glow-two" aria-hidden="true" />
      <span className="product-section-pattern" aria-hidden="true" />
      <div className="container relative z-10 mx-auto px-4">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="mb-2 block h-1 w-10 rounded-full bg-sky-500" />
            <h2 className="text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
          </div>
          <Link href={href} className="group flex shrink-0 items-center gap-1 rounded-full border border-sky-100 bg-white px-3 py-2 text-sm font-bold text-secondary shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
            عرض الكل <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>

        {autoRotate && visibleProducts.length > 1 ? (
          <AutoRotatingProductRail products={visibleProducts} rotationInterval={rotationInterval} />
        ) : (
          <div className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(168px,72vw)] gap-3 overflow-x-auto pb-4 sm:auto-cols-[220px] sm:gap-5 lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible lg:pb-0 xl:grid-cols-5">
            {visibleProducts.map(product => <div key={product.id} className="snap-start"><ProductCard product={product} /></div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function AutoRotatingProductRail({ products, rotationInterval }: { products: ProductSummary[]; rotationInterval: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    direction: "rtl",
    loop: products.length > 5,
    skipSnaps: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snapCount, setSnapCount] = useState(products.length);
  const [manualPaused, setManualPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [timerVersion, setTimerVersion] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setSnapCount(emblaApi.scrollSnapList().length);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!rootRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const paused = manualPaused || interactionPaused || reduceMotion || !isVisible;

  useEffect(() => {
    if (!emblaApi || paused) return;
    const timer = window.setInterval(() => emblaApi.scrollNext(), rotationInterval);
    return () => window.clearInterval(timer);
  }, [emblaApi, paused, rotationInterval, selectedIndex, timerVersion]);

  const navigate = (direction: "next" | "previous") => {
    if (!emblaApi) return;
    if (direction === "next") emblaApi.scrollNext();
    else emblaApi.scrollPrev();
    setTimerVersion(version => version + 1);
  };

  const goTo = (index: number) => {
    emblaApi?.scrollTo(index);
    setTimerVersion(version => version + 1);
  };

  return (
    <div
      ref={rootRef}
      className="group/rail relative"
      role="region"
      aria-roledescription="عارض كتب متحرك"
      aria-label="كتب تتجدد تلقائيًا"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteractionPaused(false);
      }}
    >
      <div ref={viewportRef} className="overflow-hidden rounded-3xl" dir="rtl">
        <div className="flex touch-pan-y gap-3 pb-4 sm:gap-5">
          {products.map((product, index) => (
            <div
              key={product.id}
              className="min-w-0 flex-[0_0_78%] sm:flex-[0_0_46%] md:flex-[0_0_31%] lg:flex-[0_0_23%] xl:flex-[0_0_19%]"
              role="group"
              aria-roledescription="كتاب"
              aria-label={`${index + 1} من ${products.length}`}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>

      <div className="absolute top-[38%] z-20 -translate-y-1/2" style={{ insetInlineStart: "0.75rem" }}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="الكتب السابقة"
          onClick={() => navigate("previous")}
          className="h-11 w-11 rounded-full border-white/80 bg-white/95 shadow-lg transition hover:scale-105 hover:bg-white"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="absolute top-[38%] z-20 -translate-y-1/2" style={{ insetInlineEnd: "0.75rem" }}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="الكتب التالية"
          onClick={() => navigate("next")}
          className="h-11 w-11 rounded-full border-white/80 bg-white/95 shadow-lg transition hover:scale-105 hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur sm:px-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 sm:text-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>{reduceMotion ? "التبديل التلقائي متوقف حسب إعدادات جهازك" : manualPaused ? "التبديل التلقائي متوقف" : "كتب جديدة تظهر تلقائيًا كل عدة ثوانٍ"}</span>
        </div>

        <div className="flex items-center gap-2 max-sm:ml-12">
          <div className="hidden items-center gap-1.5 sm:flex" aria-label={`المجموعة ${selectedIndex + 1} من ${snapCount}`}>
            {Array.from({ length: snapCount }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`انتقل إلى المجموعة ${index + 1}`}
                aria-current={index === selectedIndex ? "true" : undefined}
                onClick={() => goTo(index)}
                className={`h-2 rounded-full transition-all ${index === selectedIndex ? "w-7 bg-sky-500" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
              />
            ))}
          </div>
          {!reduceMotion && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManualPaused(value => !value)}
              aria-label={manualPaused ? "تشغيل التبديل التلقائي" : "إيقاف التبديل التلقائي"}
              className="h-9 w-9 gap-1.5 rounded-full p-0 text-xs font-bold sm:w-auto sm:px-3"
            >
              {manualPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{manualPaused ? "تشغيل" : "إيقاف"}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
