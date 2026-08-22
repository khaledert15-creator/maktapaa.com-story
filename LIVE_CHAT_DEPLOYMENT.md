# تكامل الدردشة المباشرة مع Chatwoot

## ملخص البنية الحالية

- الواجهة العامة: React 19 وTypeScript وVite وTailwind، بواجهة عربية RTL مخصصة بالكامل.
- الخادم: Express 5 وDrizzle وPostgreSQL. المتصفح لا يتصل بـChatwoot مباشرة ولا تصله مفاتيح Chatwoot.
- الجلسات: جلسة عميل/زائر محفوظة في PostgreSQL عبر cookie من نوع `HttpOnly` و`SameSite=Lax` و`Secure` في الإنتاج.
- Chatwoot: يعمل كمنصة الموظفين فقط. الرسائل تمر من المتصفح إلى Express، ثم إلى Public API الرسمية في Chatwoot.
- التحديث الفوري: Express يشترك في ActionCable باستخدام `pubsub_token` المشفر، ثم يرسل الأحداث للمتصفح عبر SSE. يوجد polling تلقائي عند انقطاع الاتصال الفوري.

## ما تم تنفيذه

- محادثة واحدة مستمرة لكل عميل مسجل أو زائر مجهول، مع ربط محادثة الزائر بالعميل بعد تسجيل الدخول.
- تخزين الربط في `website_chat_threads`، وتشفير `source_id` و`pubsub_token` باستخدام AES-256-GCM.
- إرسال واستقبال الرسائل، مؤشر الكتابة، حالة الاتصال وتوافر الموظفين، الرسائل غير المقروءة، السجل السابق، الصور وPDF.
- سياق آمن للصفحة والمنتج والسلة والطلب. الخادم يعيد جلب التفاصيل من PostgreSQL، ويتحقق من ملكية الطلب قبل إرسالها إلى Chatwoot.
- أزرار مساعدة داخل صفحة المنتج وتفاصيل الطلب وحساب العميل.
- تحديد معدل الطلبات، حدود حجم ونوع الملفات، proxy آمن للمرفقات، مهلات زمنية، وفصل تعطل Chatwoot عن بقية المتجر.
- Feature flag مغلق افتراضيًا، لذلك لن تظهر واجهة غير متصلة فعليًا في الإنتاج.

## متغيرات البيئة

```env
WEBSITE_CHAT_ENABLED=false
WEBSITE_CHAT_ENCRYPTION_KEY=<32-byte-or-longer-random-secret>
WEBSITE_CHAT_ATTACHMENT_MAX_BYTES=5242880
WEBSITE_CHAT_FALLBACK_POLL_MS=15000

CHATWOOT_BASE_URL=https://chat.example.com
CHATWOOT_REALTIME_URL=wss://chat.example.com/cable
CHATWOOT_API_INBOX_IDENTIFIER=<generated-api-inbox-identifier>
CHATWOOT_HMAC_TOKEN=<generated-inbox-hmac-token>
CHATWOOT_REQUEST_TIMEOUT_MS=10000
```

استخدم مفتاح تشفير عشوائيًا ثابتًا، ولا تغيّره بعد إنشاء المحادثات وإلا لن يمكن فك أسرار الربط القديمة:

```bash
openssl rand -base64 48
```

## إنشاء Inbox رسميًا

يحتاج أمر الإنشاء مرة واحدة فقط إلى مفاتيح حساب Chatwoot الإدارية:

```env
CHATWOOT_ACCOUNT_ID=<account-id>
CHATWOOT_ACCOUNT_ACCESS_TOKEN=<temporary-admin-access-token>
```

ثم شغّل:

```bash
pnpm --filter @workspace/api-server chatwoot:provision
```

الأمر idempotent: يبحث أولًا عن Inbox باسم `Website Chat – Maktaba Dot Com`، وينشئه فقط إن لم يكن موجودًا. تُكتب القيم الناتجة في ملف خاص `.chatwoot-inbox.env` بصلاحيات `0600` ولا تُطبع الرموز السرية في الطرفية. انقل القيم إلى مدير أسرار الإنتاج، ثم احذف مفاتيح الحساب الإدارية من بيئة التطبيق.

## الترحيل والتشغيل

1. خذ نسخة احتياطية من PostgreSQL.
2. طبّق migrations `0014_curvy_hobgoblin.sql` ثم `0015_lyrical_wallow.sql`.
3. أضف قيم Chatwoot الحقيقية، مع إبقاء `WEBSITE_CHAT_ENABLED=false`.
4. شغّل فحوصات الصحة وتحقق من الوصول إلى `https://chat.example.com/cable` عبر WSS.
5. فعّل `WEBSITE_CHAT_ENABLED=true` وأعد تشغيل API فقط.
6. اختبر رسالة حقيقية من المتجر وردًا حقيقيًا من موظف Chatwoot قبل الإعلان عن الإطلاق.

الترحيلان إضافيان فقط: ينشئان enum وجدولًا وفهارسًا ومفتاحًا أجنبيًا، ولا يحتويان `DELETE` أو `DROP TABLE`. الترحيل الثاني يغير سلوك حذف العميل إلى `ON DELETE CASCADE` للمحافظة على قيد ملكية المحادثة.

## نقاط تحقق الإنتاج

- يجب أن يكون كل من المتجر وChatwoot خلف HTTPS؛ ويجب أن يكون ActionCable خلف WSS مع تمرير رؤوس WebSocket.
- لا تضع access token أو HMAC token في Vite أو أي متغير يبدأ بـ`VITE_`.
- ادمج إصلاحات ظهور المحادثات/التنبيهات في نسخة Chatwoot المستخدمة قبل الاعتماد على لوحة الموظفين.
- احتفظ بنسخة احتياطية لقاعدة بيانات Maktaba ولقاعدة بيانات/ملفات Chatwoot.
- راقب معدلات 5xx ووقت استجابة Chatwoot وإعادة اتصال SSE/ActionCable.
- عند تشغيل أكثر من نسخة API، انقل rate limiting إلى Redis أو مخزن مشترك، وراجع استراتيجية اشتراكات ActionCable لكل instance.

## حدود التحقق الحالي

اختبارات التكامل تستخدم PostgreSQL حقيقيًا وChatwoot mock مطابقًا لعقود Public API وActionCable. لا تُعد المحادثة جاهزة للإطلاق النهائي حتى تتوفر بيانات Chatwoot الفعلية ويُنفذ اختبار round-trip حقيقي من المتجر إلى لوحة الموظف والعكس.
