# Maktaba Dot Com

متجر عربي RTL للكتب التعليمية مع لوحة إدارة، مبني على React وExpress وPostgreSQL. هذا المستودع هو المصدر الحالي للمشروع؛ لا تستخدم `main` أو أي مستند تاريخي لتجاوز فرع عمل أحدث دون مراجعة Git أولًا.

## Architecture

- `artifacts/maktaba`: واجهة React 19 + Vite + TanStack Query + Wouter.
- `artifacts/api-server`: Express 5 API، جلسات PostgreSQL، وخدمات الطلبات والشحن والكوبونات والمخزون والشات.
- `lib/db`: Drizzle schema ومهاجرات PostgreSQL فقط؛ SQLite غير مدعوم.
- `lib/api-spec`: عقد OpenAPI، و`lib/api-client-react` و`lib/api-zod` للعميل والتحقق المشترك.
- `scripts`: فحوص واختبارات تحميل مساعدة. ملفات `deploy` مرجعية ولا تُشغّل أثناء التطوير المحلي.

المتجر والإدارة يستخدمان PostgreSQL عبر API واحد. الدفع الفعال هو الدفع نقدًا عند الاستلام فقط، وفوري غير مفعل. العميل يرسل طلب إلغاء، والموظف المصرح له يقرر الطلب داخل معاملة تعيد المخزون مرة واحدة فقط.

## Local setup

المتطلبات: Node.js حديث، pnpm، وPostgreSQL. لا تضع أي Secret في Git.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm --filter @workspace/db migrate
pnpm --filter @workspace/api-server seed
```

عدّل `DATABASE_URL` داخل `.env` إلى قاعدة تطوير PostgreSQL محلية. شغّل الـAPI والواجهة في نافذتين:

```bash
set -a; . ./.env; set +a
pnpm --filter @workspace/api-server dev
```

```bash
pnpm --filter @workspace/maktaba dev
```

الواجهة المحلية: `http://localhost:5173`، والـAPI افتراضيًا: `http://localhost:5001`.

## Database and migrations

- المخطط في `lib/db/src/schema` والمهاجرات في `lib/db/drizzle`، وتشمل `0001_slimy_flatman.sql`.
- استخدم `pnpm --filter @workspace/db migrate` ولا تستخدم `push-force` مع بيانات حقيقية.
- راجع SQL قبل تطبيق أي Migration خارج Development، وخذ نسخة احتياطية قابلة للاسترجاع أولًا.
- Seed التطوير: `pnpm --filter @workspace/api-server seed`. لا تشغّله على Production.

## Checks

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

`pnpm run test` يقرأ `.env` الجذري إن وُجد، ويحتاج PostgreSQL متاحًا لتشغيل اختبارات المعاملات والأمان. لا تدّعي نجاح PostgreSQL tests قبل تشغيلها فعليًا.

## Environment variables

القائمة الآمنة للأسماء موجودة في `.env.example` و`.env.production.example`:

- Core: `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, `PUBLIC_SITE_URL`, `API_URL`, `COOKIE_DOMAIN`, `TRUST_PROXY`.
- Pool: `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`.
- Admin: `ADMIN_IDLE_TIMEOUT_MS`، والافتراضي أربع ساعات من عدم النشاط.
- Storage: `STORAGE_PROVIDER` وقيم `S3_*`. Production يرفض Local Storage ما لم يوجد تجاوز صريح؛ لا تستخدم التجاوز في الإطلاق.
- Email: `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`. Development يعمل بـ`log`؛ Production validation يطلب Resend حقيقيًا.
- Monitoring: `SENTRY_DSN` اختياري ولا يحدث إرسال إذا كان فارغًا. `BUILD_VERSION` يجب أن يساوي SHA المنشور.
- Website Chat: قيم `WEBSITE_CHAT_*` و`CHATWOOT_*` سرية وتبقى server-side.

## Website Chat

التنفيذ الحالي مخصص ومتكامل مع Chatwoot عبر API/WebSocket مع polling fallback وحماية IDOR ورفع ملفات محدود. لا تُعد بناءه ولا تضع Chatwoot tokens في `VITE_*`.

- يبقى `WEBSITE_CHAT_ENABLED=false` في Production إلى أن ينجح اختبار Customer → Agent → Customer الحقيقي.
- يمكن تفعيله محليًا فقط بقيم حقيقية في `.env` غير المتتبع.
- `WEBSITE_CHAT_ENCRYPTION_KEY` ثابت وعشوائي ولا يقل عن 32 حرفًا.
- بيانات provisioning المؤقتة تُحذف من البيئة بعد التجهيز.

راجع `LIVE_CHAT_DEPLOYMENT.md` للتفاصيل؛ خطوات Production فيه تتطلب قرار نشر مستقل.

## Analytics readiness

GA4 وMeta Pixel وTikTok Pixel معطلة افتراضيًا. الأحداث الموحدة هي `ViewContent`, `Search`, `AddToCart`, `RemoveFromCart`, `InitiateCheckout`, `Purchase` ولا تحتوي على هاتف أو بريد أو عنوان.

بعد مراجعة الخصوصية والموافقة على القياس، يلزم ضبط القيم الحقيقية وقت build:

```text
ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENABLED=true
VITE_GA4_ID=...
VITE_META_PIXEL_ID=...
VITE_TIKTOK_PIXEL_ID=...
```

عدم وجود IDs أو بقاء flag معطلًا يمنع تحميل سكربتات الموردين أو إرسال الأحداث.

## Security and scaling notes

- كل Admin route يعتمد Permission server-side، وليس إخفاء رابط الواجهة فقط.
- جلسة الإدارة لها idle timeout مستقل. الأعمال شديدة الحساسية يفضل أن تضيف لها إعادة إدخال كلمة المرور قبل Production؛ MFA يحتاج مزودًا خارجيًا ولم يُفعّل محليًا.
- Cookies هي `HttpOnly`, `SameSite=Lax`, و`Secure` في Production. CORS دقيق وCSP يتوسع لموردي analytics فقط عند تفعيل server flag.
- Rate limiting الحالي مناسب لنسخة API واحدة. أكثر من API instance يتطلب Redis-backed limiter مركزيًا حتى لا تصبح الحدود منفصلة لكل instance.
- رفع الصور يتحقق من النوع والحجم ويستخدم abstraction للتخزين. جهّز R2/S3 ونسخًا احتياطية قبل Production.
- لا تطبع request bodies أو Secrets في logs، وأخطاء العميل لا تتضمن stack traces.

## SEO

يوجد metadata وcanonical وProduct JSON-LD وbreadcrumbs، مع server-rendered shell للروابط العامة المهمة، و`/sitemap.xml` و`/robots.txt` و404 حقيقي للمنتج غير الموجود. اضبط `PUBLIC_SITE_URL` على الدومين النهائي قبل build/deploy.

## Staging requirements

لا توجد Staging منشأة تلقائيًا. عند اعتمادها لاحقًا يجب أن تكون لها قاعدة PostgreSQL وbucket وdomain وsecrets منفصلة، ببيانات غير حساسة، ثم تشغيل migrations وsmoke tests. لا تربطها بقاعدة Production أو Chatwoot/WhatsApp الحقيقيين دون موافقة منفصلة.

## Deployment safety

النشر ليس جزءًا من التشغيل المحلي. قبل أي نشر لاحق: ثبّت Git SHA، خذ database backup وrollback point، ابنِ images immutable، راجع وطبّق migrations، شغّل health checks، ثم smoke test للمتجر والإدارة. لا تغيّر DNS أو Cloudflare أو Chatwoot أو Production environment ضمن commit تطوير عادي.

## Legacy and generated files

- `IMPLEMENTATION_AUDIT.md` تقرير تاريخي؛ الكود والاختبارات الحالية هي المرجع عند التعارض.
- `Stubs.tsx` اسمه قديم لكنه يحتوي `AdminProductForm` المستخدم فعليًا، لذلك لا يُحذف دون نقل التنفيذ.
- `artifacts/mockup-sandbox` workspace تجريبي منفصل وليس مسار المتجر المنشور؛ حذفه يحتاج قرارًا مستقلًا.
- ملفات clients وschemas المولدة لا تُعدّل يدويًا إلا عبر مسار التوليد المعتمد.
