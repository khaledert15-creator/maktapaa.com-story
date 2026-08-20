import type { ReactNode } from "react";
import type { Grade, HomepageLayout, HomepageTeacher, ProductSummary } from "@workspace/api-client-react";
import { ArrowLeft, BookMarked, GraduationCap, Layers3, Sparkles, UserRoundSearch } from "lucide-react";
import { Link } from "wouter";
import { InteractiveProductModel } from "./InteractiveProductModel";

export function HomeDiscovery({
  products,
  teachers,
  grades,
  layout,
}: {
  products: ProductSummary[];
  teachers: HomepageTeacher[];
  grades: Grade[];
  layout: HomepageLayout;
}) {
  const gradeMap = new Map(grades.map(grade => [grade.id, grade]));
  const teacherMap = new Map(teachers.map(teacher => [teacher.id, teacher]));
  const productMap = new Map(products.map(product => [product.id, product]));
  const secondaryGrades = layout.discovery.secondaryGradeIds.flatMap(id => gradeMap.get(id) ? [gradeMap.get(id)!] : []);
  const baccalaureateGrades = layout.discovery.baccalaureateGradeIds.flatMap(id => gradeMap.get(id) ? [gradeMap.get(id)!] : []);
  const visibleTeachers = layout.discovery.teacherIds.flatMap(id => teacherMap.get(id) ? [teacherMap.get(id)!] : []);
  const showcaseModels = layout.discovery.models.flatMap(model => {
    const product = productMap.get(model.productId); return product ? [{ product, model }] : [];
  });

  if (!layout.discovery.enabled || (!showcaseModels.length && !secondaryGrades.length && !baccalaureateGrades.length && !visibleTeachers.length)) return null;

  return (
    <section className="home-discovery relative my-10 overflow-hidden bg-slate-950 py-14 text-white sm:my-14 sm:py-20" aria-labelledby="discovery-title">
      <div className="home-discovery-grid absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="home-discovery-aurora home-discovery-aurora-one" aria-hidden="true" />
      <div className="home-discovery-aurora home-discovery-aurora-two" aria-hidden="true" />
      <div className="container relative mx-auto px-4">
        <div className="home-discovery-shell grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-12">
        <div className="home-discovery-copy">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-bold text-sky-200">
            <Sparkles className="h-4 w-4" />
            {layout.discovery.badgeText}
          </div>
          <h2 id="discovery-title" className="home-discovery-title max-w-2xl text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{layout.discovery.title}</h2>
          <p className="mt-4 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">{layout.discovery.description}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {!!secondaryGrades.length && <DiscoveryGroup icon={GraduationCap} title={layout.discovery.secondaryTitle}>
              {secondaryGrades.map(grade => <DiscoveryLink key={grade.id} href={`/catalog?gradeId=${grade.id}`} label={grade.nameAr} />)}
            </DiscoveryGroup>}
            {!!baccalaureateGrades.length && <DiscoveryGroup icon={Layers3} title={layout.discovery.baccalaureateTitle}>
              {baccalaureateGrades.map(grade => <DiscoveryLink key={grade.id} href={`/catalog?gradeId=${grade.id}`} label={grade.nameAr} />)}
            </DiscoveryGroup>}
          </div>

          {!!visibleTeachers.length && <div className="discovery-teachers mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2 font-black"><UserRoundSearch className="h-5 w-5 text-amber-300" /> {layout.discovery.teachersTitle}</div>
            <div className="flex flex-wrap gap-2">
              {visibleTeachers.map(teacher => <Link key={teacher.id} href={`/catalog?author=${encodeURIComponent(teacher.nameAr)}`} className="rounded-full border border-white/10 bg-white/10 px-3.5 py-2 text-sm font-bold text-slate-100 transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-sky-300/15">{teacher.nameAr}</Link>)}
            </div>
          </div>}
        </div>

        {!!showcaseModels.length && <div className="product-model-arena relative min-h-[430px]" aria-label="منتجات مختارة بتأثير ثلاثي الأبعاد">
          <div className="product-model-orbit" aria-hidden="true"><span /><span /></div>
          <div className="product-model-spotlight" aria-hidden="true" />
          <div className="product-model-stage flex min-h-[430px] items-end justify-center gap-1 sm:gap-5">
            {showcaseModels.map(({ product, model }, index) => <InteractiveProductModel key={product.id} product={product} position={index} imageUrl={model.imageUrl} caption={model.caption} />)}
          </div>
        </div>}
        </div>
      </div>
    </section>
  );
}

function DiscoveryGroup({ icon: Icon, title, children }: { icon: typeof BookMarked; title: string; children: ReactNode }) {
  return <div className="discovery-group rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm"><div className="mb-4 flex items-center gap-2 font-black"><span className="discovery-group-icon"><Icon className="h-5 w-5" /></span>{title}</div><div className="space-y-1">{children}</div></div>;
}

function DiscoveryLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="group/link flex items-center justify-between rounded-xl px-2 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"><span>{label}</span><ArrowLeft className="h-4 w-4 text-slate-400 transition group-hover/link:-translate-x-1" /></Link>;
}
