import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useListFeaturedProducts, useListGrades, useListProducts, useListPublishers, useListStages, useListSubjects } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Truck, ShieldCheck, Package, BookOpen, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGradeId, setSelectedGradeId] = useState<number | undefined>(() => {
    const savedGrade = localStorage.getItem("maktaba_selected_grade");
    return savedGrade ? Number(savedGrade) : undefined;
  });
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | undefined>();
  const { data: featuredProducts, isLoading: isLoadingFeatured } = useListFeaturedProducts();
  const { data: stages, isLoading: isLoadingStages } = useListStages();
  const { data: publishers, isLoading: isLoadingPublishers } = useListPublishers();
  const { data: grades, isLoading: isLoadingGrades } = useListGrades();
  const { data: subjects, isLoading: isLoadingSubjects } = useListSubjects(
    selectedGradeId ? { gradeId: selectedGradeId } : undefined,
  );
  const { data: tailoredProducts, isLoading: isLoadingTailored } = useListProducts({
    page: 1,
    limit: 8,
    gradeId: selectedGradeId,
    subjectId: selectedSubjectId,
    sortBy: "best_selling",
  });

  useEffect(() => {
    if (selectedGradeId) {
      localStorage.setItem("maktaba_selected_grade", String(selectedGradeId));
    }
  }, [selectedGradeId]);

  const secondaryGrades = useMemo(() => {
    const relevantGrades = grades?.filter((grade) =>
      /ثانوي|بكالوريا/.test(grade.nameAr),
    );
    return relevantGrades?.length ? relevantGrades : grades;
  }, [grades]);

  const selectedGrade = grades?.find((grade) => grade.id === selectedGradeId);
  const selectedSubject = subjects?.find((subject) => subject.id === selectedSubjectId);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) setLocation(`/search?q=${encodeURIComponent(query)}`);
  };

  const selectGrade = (gradeId: number) => {
    setSelectedGradeId(gradeId);
    setSelectedSubjectId(undefined);
  };

  return (
    <div className="flex flex-col gap-9 md:gap-12 pb-12">
      {/* Mobile-first discovery: get students to relevant books in one viewport. */}
      <section className="md:hidden order-1 px-4 pt-5">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-secondary/15 bg-gradient-to-br from-white via-sky-50 to-blue-100/70 p-4 shadow-sm">
          <div className="absolute -left-10 -top-12 h-32 w-32 rounded-full bg-secondary/10 blur-2xl" />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-white shadow-sm shadow-secondary/25">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-xl font-black text-primary">وصل لكتبك بسرعة</h1>
                <p className="text-xs text-muted-foreground">ابحث أو اختار صفك وشاهد الكتب فورًا</p>
              </div>
            </div>

            <form onSubmit={handleSearch} className="relative mb-5">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="اسم الكتاب، المادة أو دار النشر..."
                aria-label="ابحث عن كتاب"
                className="h-12 w-full rounded-2xl border border-secondary/20 bg-white pr-4 pl-12 text-sm shadow-sm outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/10"
              />
              <button
                type="submit"
                aria-label="بحث"
                className="absolute left-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white transition active:scale-95"
              >
                <Search className="h-4 w-4" />
              </button>
            </form>

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-extrabold">اختار صفك</h2>
                {selectedGradeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGradeId(undefined);
                      setSelectedSubjectId(undefined);
                      localStorage.removeItem("maktaba_selected_grade");
                    }}
                    className="text-[11px] font-bold text-secondary"
                  >
                    عرض الكل
                  </button>
                )}
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {isLoadingGrades ? (
                  Array(4).fill(0).map((_, index) => <Skeleton key={index} className="h-10 w-28 shrink-0 rounded-full" />)
                ) : (
                  secondaryGrades?.map((grade) => (
                    <button
                      key={grade.id}
                      type="button"
                      onClick={() => selectGrade(grade.id)}
                      aria-pressed={selectedGradeId === grade.id}
                      className={`h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-all active:scale-95 ${
                        selectedGradeId === grade.id
                          ? "border-primary bg-primary text-white shadow-md shadow-primary/15"
                          : "border-border bg-white text-foreground shadow-sm"
                      }`}
                    >
                      {grade.nameAr}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-extrabold">اختار المادة</h2>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedSubjectId(undefined)}
                  aria-pressed={!selectedSubjectId}
                  className={`h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-all active:scale-95 ${
                    !selectedSubjectId ? "border-secondary bg-secondary text-white" : "border-border bg-white"
                  }`}
                >
                  كل المواد
                </button>
                {isLoadingSubjects ? (
                  Array(4).fill(0).map((_, index) => <Skeleton key={index} className="h-10 w-24 shrink-0 rounded-full" />)
                ) : (
                  subjects?.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => setSelectedSubjectId(subject.id)}
                      aria-pressed={selectedSubjectId === subject.id}
                      className={`h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-all active:scale-95 ${
                        selectedSubjectId === subject.id
                          ? "border-secondary bg-secondary text-white"
                          : "border-border bg-white"
                      }`}
                    >
                      {subject.nameAr}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Banner Area */}
      <section className="hidden md:block md:order-1 bg-primary/5 py-8 md:py-16">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 space-y-6 text-center md:text-right">
            <Badge variant="outline" className="bg-white px-3 py-1 text-sm border-secondary text-secondary">
              الأقوى في مصر 🇪🇬
            </Badge>
            <h1 className="text-4xl md:text-6xl font-black text-primary leading-tight">
              كل كتبك المدرسية<br/>في مكان واحد
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
              مكتبة دوت كوم توفر لك أحدث طبعات الكتب المدرسية، كتب اللغات، وكتب المراجعات النهائية لجميع المراحل الدراسية.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
              <Button size="lg" className="text-lg px-8 bg-secondary hover:bg-secondary/90 text-secondary-foreground" asChild>
                <Link href="/catalog">تصفح الكتب الآن</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" asChild>
                <Link href="/stages">اختر المرحلة الدراسية</Link>
              </Button>
            </div>
          </div>
          <div className="flex-1 w-full max-w-lg aspect-square bg-gradient-to-tr from-accent/20 to-secondary/20 rounded-[3rem] p-8 flex items-center justify-center relative overflow-hidden">
             {/* Abstract decorative shapes */}
             <div className="absolute top-10 right-10 w-32 h-32 bg-secondary/30 rounded-full blur-2xl"></div>
             <div className="absolute bottom-10 left-10 w-40 h-40 bg-accent/30 rounded-full blur-2xl"></div>
             
             {/* We can use an abstract icon composition since we don't have images ready */}
             <div className="relative z-10 grid grid-cols-2 gap-4 w-full h-full">
                <div className="bg-white rounded-2xl shadow-xl p-6 flex flex-col items-center justify-center gap-4 transform -rotate-6 hover:rotate-0 transition-transform">
                  <BookOpen className="w-16 h-16 text-primary" />
                  <div className="w-20 h-3 bg-muted rounded-full"></div>
                  <div className="w-16 h-3 bg-muted rounded-full"></div>
                </div>
                <div className="bg-primary text-primary-foreground rounded-2xl shadow-xl p-6 flex flex-col items-center justify-center gap-4 transform translate-y-8 rotate-3 hover:rotate-0 transition-transform">
                  <span className="text-4xl font-bold text-accent">2025</span>
                  <span className="text-lg font-medium">أحدث الطبعات</span>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 order-3 md:order-2">
        <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:gap-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Card className="w-52 shrink-0 border-none bg-blue-50/70 shadow-sm md:w-auto">
            <CardContent className="flex items-center gap-3 p-3 text-right md:flex-col md:p-6 md:text-center md:gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-secondary/10 text-secondary flex items-center justify-center md:h-12 md:w-12">
                <Truck className="h-6 w-6" />
              </div>
              <div><h3 className="text-sm font-bold md:text-base">شحن لكل مصر</h3>
              <p className="text-[11px] text-muted-foreground md:text-sm">لحد باب البيت</p></div>
            </CardContent>
          </Card>
          <Card className="w-52 shrink-0 border-none bg-amber-50/70 shadow-sm md:w-auto">
            <CardContent className="flex items-center gap-3 p-3 text-right md:flex-col md:p-6 md:text-center md:gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center md:h-12 md:w-12">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div><h3 className="text-sm font-bold md:text-base">دفع عند الاستلام</h3>
              <p className="text-[11px] text-muted-foreground md:text-sm">استلم وبعدين ادفع</p></div>
            </CardContent>
          </Card>
          <Card className="w-52 shrink-0 border-none bg-emerald-50/70 shadow-sm md:w-auto">
            <CardContent className="flex items-center gap-3 p-3 text-right md:flex-col md:p-6 md:text-center md:gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center md:h-12 md:w-12">
                <Package className="h-6 w-6" />
              </div>
              <div><h3 className="text-sm font-bold md:text-base">تغليف يحمي كتبك</h3>
              <p className="text-[11px] text-muted-foreground md:text-sm">توصلك بحالة ممتازة</p></div>
            </CardContent>
          </Card>
          <Card className="w-52 shrink-0 border-none bg-purple-50/70 shadow-sm md:w-auto">
            <CardContent className="flex items-center gap-3 p-3 text-right md:flex-col md:p-6 md:text-center md:gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center md:h-12 md:w-12">
                <BookOpen className="h-6 w-6" />
              </div>
              <div><h3 className="text-sm font-bold md:text-base">أحدث الطبعات</h3>
              <p className="text-[11px] text-muted-foreground md:text-sm">من أفضل دور النشر</p></div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Featured Products */}
      <section className="container mx-auto px-4 order-2 md:order-3">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl md:text-3xl font-bold text-primary mb-1 md:mb-2">
              <span className="md:hidden">
                {selectedSubject
                  ? `كتب ${selectedSubject.nameAr}${selectedGrade ? ` — ${selectedGrade.nameAr}` : ""}`
                  : selectedGrade
                    ? `كتب ${selectedGrade.nameAr}`
                    : "الأكثر طلبًا الآن"}
              </span>
              <span className="hidden md:inline">أحدث وأقوى الكتب</span>
            </h2>
            <p className="text-xs md:text-base text-muted-foreground">
              {selectedGradeId ? "اختيارات مناسبة لك ومتاحة للطلب" : "الكتب الأكثر طلباً هذا الأسبوع"}
            </p>
          </div>
          <Button variant="ghost" className="text-secondary" asChild>
            <Link
              href={`/catalog${selectedGradeId || selectedSubjectId ? `?${new URLSearchParams({
                ...(selectedGradeId ? { gradeId: String(selectedGradeId) } : {}),
                ...(selectedSubjectId ? { subjectId: String(selectedSubjectId) } : {}),
              }).toString()}` : ""}`}
              className="flex items-center gap-1 px-2 md:px-4"
            >
              عرض الكل
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="md:hidden -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {isLoadingTailored ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="w-[43vw] max-w-44 shrink-0 overflow-hidden border-border/50">
                <Skeleton className="aspect-[3/4] w-full rounded-none" />
                <CardContent className="p-3 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-5 w-1/2" /></CardContent>
              </Card>
            ))
          ) : tailoredProducts?.items.length ? (
            tailoredProducts.items.map((product) => (
              <Link key={product.id} href={`/product/${product.slug}`} className="w-[43vw] max-w-44 shrink-0 snap-start">
                <Card className="h-full overflow-hidden border-border/60 bg-white shadow-sm transition-all active:scale-[.98]">
                  <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                    {product.coverImage ? (
                      <img src={product.coverImage} alt={product.nameAr} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-primary/5 px-3 text-center text-primary/40">
                        <BookOpen className="mb-2 h-10 w-10" />
                        <span className="line-clamp-2 text-xs font-bold">{product.nameAr}</span>
                      </div>
                    )}
                    {product.discountPercent && product.discountPercent > 0 ? (
                      <Badge className="absolute right-2 top-2 bg-destructive text-[10px]">خصم {product.discountPercent}%</Badge>
                    ) : null}
                  </div>
                  <CardContent className="p-3">
                    <div className="mb-1 truncate text-[10px] text-muted-foreground">{product.publisher || "كتاب مدرسي"}</div>
                    <h3 className="mb-2 line-clamp-2 min-h-9 text-xs font-extrabold leading-5">{product.nameAr}</h3>
                    <span className="font-black text-primary">{product.price} ج.م</span>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <div className="w-full rounded-2xl border border-dashed bg-muted/30 p-6 text-center">
              <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-bold">لا توجد كتب لهذا الاختيار حاليًا</p>
              <button type="button" onClick={() => setSelectedSubjectId(undefined)} className="mt-2 text-xs font-bold text-secondary">عرض كل المواد</button>
            </div>
          )}
        </div>

        <div className="hidden md:grid md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {isLoadingFeatured ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i} className="overflow-hidden border-border/50">
                <Skeleton className="h-48 w-full rounded-none" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/3 mt-4" />
                </CardContent>
              </Card>
            ))
          ) : (
            featuredProducts?.slice(0, 5).map((product) => (
              <Link key={product.id} href={`/product/${product.slug}`}>
                <Card className="h-full overflow-hidden hover-elevate border-border/50 transition-all hover:border-secondary cursor-pointer group">
                  <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                    {product.coverImage ? (
                      <img src={product.coverImage} alt={product.nameAr} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-primary/5 text-primary/40 group-hover:bg-primary/10 transition-colors">
                        <BookOpen className="w-12 h-12 mb-2" />
                        <span className="text-xs font-bold text-center px-4 line-clamp-2">{product.nameAr}</span>
                      </div>
                    )}
                    {product.discountPercent && product.discountPercent > 0 && (
                      <Badge className="absolute top-2 right-2 bg-destructive text-destructive-foreground font-bold">
                        خصم {product.discountPercent}%
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground mb-1">{product.publisher || 'ناشر غير معروف'}</div>
                    <h3 className="font-bold text-sm md:text-base mb-2 line-clamp-2 leading-tight group-hover:text-secondary transition-colors">
                      {product.nameAr}
                    </h3>
                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <span className="font-black text-lg text-primary">{product.price} ج.م</span>
                      {product.oldPrice && (
                        <span className="text-xs text-muted-foreground line-through">{product.oldPrice} ج.م</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* Educational Stages */}
      <section className="hidden md:block bg-muted/30 py-12 md:py-16 order-4">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-primary mb-2">تصفح حسب المرحلة الدراسية</h2>
            <p className="text-muted-foreground">اختر المرحلة لتجد كل الكتب والملازم الخاصة بها</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {isLoadingStages ? (
              Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            ) : (
              stages?.slice(0, 4).map((stage) => (
                <Link key={stage.id} href={`/catalog?stageId=${stage.id}`}>
                  <Card className="hover-elevate cursor-pointer border-2 border-transparent hover:border-secondary transition-colors h-full">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
                      <div className="h-16 w-16 bg-primary/5 rounded-full flex items-center justify-center mb-4 text-primary">
                        <BookOpen className="h-8 w-8" />
                      </div>
                      <h3 className="text-lg font-bold">{stage.nameAr}</h3>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Publishers */}
      <section className="container mx-auto px-4 order-5">
         <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-primary mb-2">أشهر دور النشر</h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
             {isLoadingPublishers ? (
               Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
             ) : (
               publishers?.slice(0, 6).map(pub => (
                 <Link key={pub.id} href={`/catalog?publisherId=${pub.id}`}>
                    <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer border-border/50 flex items-center justify-center p-4">
                       <span className="font-bold text-center text-muted-foreground">{pub.nameAr}</span>
                    </Card>
                 </Link>
               ))
             )}
          </div>
      </section>

    </div>
  );
}
