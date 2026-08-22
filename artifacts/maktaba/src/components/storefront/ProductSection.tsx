import { useMemo } from "react";
import type { ProductSummary } from "@workspace/api-client-react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
};

export function ProductSection({
  title,
  subtitle,
  products,
  href = "/catalog",
  tone = "plain",
  autoRotate = false,
}: ProductSectionProps) {
  const visibleProducts = useMemo(
    () => autoRotate ? shuffledVisitSelection(products ?? [], 10) : (products?.slice(0, 10) ?? []),
    [autoRotate, products],
  );
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
          <FreshVisitProductRail products={visibleProducts} />
        ) : (
          <div className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(168px,72vw)] gap-3 overflow-x-auto pb-4 sm:auto-cols-[220px] sm:gap-5 lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible lg:pb-0 xl:grid-cols-5">
            {visibleProducts.map(product => <div key={product.id} className="snap-start"><ProductCard product={product} /></div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function FreshVisitProductRail({ products }: { products: ProductSummary[] }) {
  const [viewportRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    direction: "rtl",
    loop: products.length > 5,
    skipSnaps: false,
  });
  const navigate = (direction: "next" | "previous") => {
    if (!emblaApi) return;
    if (direction === "next") emblaApi.scrollNext();
    else emblaApi.scrollPrev();
  };

  return (
    <div
      className="group/rail relative"
      role="region"
      aria-roledescription="عارض كتب"
      aria-label="تشكيلة كتب مختارة لهذه الزيارة"
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

    </div>
  );
}

function shuffledVisitSelection(products: ProductSummary[], limit: number) {
  const shuffled = [...products];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
      : Math.random();
    const swapIndex = Math.floor(random * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, limit);
}
