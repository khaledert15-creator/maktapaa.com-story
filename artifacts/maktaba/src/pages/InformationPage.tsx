import { useEffect, useState, type ReactNode } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { getListFaqsQueryKey, useGetSiteSettings, useListFaqs } from "@workspace/api-client-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Seo } from "@/components/storefront/Seo";
import { informationPages, parseInformationPageContent, type InformationPageContent } from "@/content/information-pages";

export default function InformationPage() {
  const path = window.location.pathname;
  const slug = path.slice(1);
  const fallback = informationPages[slug] || informationPages.about;
  const [page, setPage] = useState<InformationPageContent>(fallback);
  const { data: settings } = useGetSiteSettings();
  const { data: faqs } = useListFaqs({ query: { queryKey: getListFaqsQueryKey(), enabled: path === "/faq" } });
  useEffect(() => {
    setPage(fallback);
    if (!informationPages[slug]) return;
    const controller = new AbortController();
    void fetch(`/api/content/pages/${encodeURIComponent(slug)}`, { credentials: "include", signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<{ content: InformationPageContent | null }> : Promise.reject(new Error("content unavailable")))
      .then(result => { const parsed = parseInformationPageContent(result.content); if (parsed) setPage(parsed); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [slug]);
  if (path === "/contact") return <Shell title={page.title} intro={page.intro}><div className="grid gap-4 sm:grid-cols-3">{settings?.phoneNumber && <Contact icon={Phone} label="الهاتف" value={settings.phoneNumber} href={`tel:${settings.phoneNumber}`} />}{settings?.email && <Contact icon={Mail} label="البريد" value={settings.email} href={`mailto:${settings.email}`} />}{settings?.address && <Contact icon={MapPin} label="العنوان" value={settings.address} />}</div>{page.sections.length > 0 && <PageSections page={page} />}</Shell>;
  if (path === "/faq") return <Shell title="الأسئلة الشائعة" intro="إجابات تديرها المكتبة من لوحة التحكم.">{faqs?.length ? <Accordion type="single" collapsible className="rounded-2xl border bg-white px-5">{faqs.map(item => <AccordionItem key={item.id} value={String(item.id)}><AccordionTrigger className="text-right font-bold">{item.questionAr}</AccordionTrigger><AccordionContent className="leading-7 text-muted-foreground">{item.answerAr}</AccordionContent></AccordionItem>)}</Accordion> : <div className="rounded-2xl border border-dashed py-14 text-center text-muted-foreground">لا توجد أسئلة منشورة حاليًا.</div>}</Shell>;
  return <Shell title={page.title} intro={page.intro}><PageSections page={page} /></Shell>;
}
function PageSections({ page }: { page: InformationPageContent }) { return <div className="space-y-4">{page.sections.map((section, index) => <Card key={`${section.title}-${index}`} className="rounded-2xl"><CardContent className="p-6"><h2 className="text-xl font-black">{section.title}</h2><p className="mt-3 whitespace-pre-line leading-8 text-muted-foreground">{section.body}</p></CardContent></Card>)}</div>; }
function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) { return <div className="container mx-auto max-w-4xl px-4 py-12"><Seo title={`${title} | مكتبة دوت كوم`} description={intro} /><div className="mb-9"><h1 className="text-4xl font-black">{title}</h1><p className="mt-3 max-w-2xl text-lg leading-8 text-muted-foreground">{intro}</p></div>{children}</div>; }
function Contact({ icon: Icon, label, value, href }: { icon: typeof Phone; label: string; value: string; href?: string }) { const content = <><Icon className="mx-auto h-7 w-7 text-secondary" /><strong className="mt-3 block">{label}</strong><span className="mt-1 block text-sm text-muted-foreground">{value}</span></>; return <Card className="rounded-2xl text-center"><CardContent className="p-6">{href ? <a href={href}>{content}</a> : content}</CardContent></Card>; }
