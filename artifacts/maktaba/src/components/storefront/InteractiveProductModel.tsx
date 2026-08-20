import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import type { ProductSummary } from "@workspace/api-client-react";
import { BookOpen } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type ModelVariant = "book" | "notebook";

function modelVariant(product: ProductSummary): ModelVariant {
  return /كشكول|كشاكيل|دفتر|أدوات|notebook/i.test(product.category || "") ? "notebook" : "book";
}

export function InteractiveProductModel({ product, position = 0, imageUrl, caption }: { product: ProductSummary; position?: number; imageUrl?: string | null; caption?: string | null }) {
  const objectRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const variant = modelVariant(product);
  const displayImage = imageUrl || product.coverImage;
  const displayCaption = caption || product.nameAr;
  const hasRealCover = Boolean(displayImage && !/placehold\.co|placeholder\./i.test(displayImage));

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const move = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "touch" || !objectRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      objectRef.current?.style.setProperty("--model-rx", `${(-y * 12).toFixed(2)}deg`);
      objectRef.current?.style.setProperty("--model-ry", `${(x * 18).toFixed(2)}deg`);
      objectRef.current?.style.setProperty("--model-lift", "-8px");
    });
  };

  const reset = () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      objectRef.current?.style.setProperty("--model-rx", "0deg");
      objectRef.current?.style.setProperty("--model-ry", "0deg");
      objectRef.current?.style.setProperty("--model-lift", "0px");
    });
  };

  return (
    <Link
      href={`/product/${product.slug}`}
      className={cn("product-model-scene group/model block", `product-model-position-${position % 3}`)}
      onPointerMove={move}
      onPointerLeave={reset}
      aria-label={`عرض ${displayCaption}`}
      data-testid="interactive-product-model"
      style={{ "--model-index": position } as CSSProperties}
    >
      <div ref={objectRef} className={cn("product-model-object", variant === "notebook" && "product-model-notebook")}>
        <div className="product-model-shadow" />
        <div className="product-model-pages" />
        <div className="product-model-spine" />
        <div className="product-model-cover">
          {hasRealCover ? (
            <img src={displayImage || undefined} alt="" width="360" height="480" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="product-model-fallback flex h-full flex-col justify-between p-4 text-right text-white">
              <span className="text-[10px] font-bold text-white/70">{product.category || product.publisher || "مكتبة دوت كوم"}</span>
              <div>
                <BookOpen className="mb-3 h-8 w-8 text-white/75" />
                <span className="line-clamp-4 text-sm font-black leading-6">{product.nameAr}</span>
              </div>
              <span className="text-[10px] font-bold text-white/65">{[product.grade, product.subject].filter(Boolean).join(" • ")}</span>
            </div>
          )}
          <span className="product-model-shine" aria-hidden="true" />
        </div>
        {variant === "notebook" && <span className="product-model-rings" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>}
      </div>
      <span className="mt-4 block max-w-44 text-center text-sm font-extrabold leading-6 text-white/90 transition group-hover/model:text-sky-200">{displayCaption}</span>
    </Link>
  );
}
