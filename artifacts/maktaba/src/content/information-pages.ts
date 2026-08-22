export type InformationPageContent = { title: string; intro: string; sections: { title: string; body: string }[] };

export function parseInformationPageContent(value: unknown): InformationPageContent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InformationPageContent>;
  if (typeof candidate.title !== "string" || typeof candidate.intro !== "string" || !Array.isArray(candidate.sections)) return null;
  if (!candidate.title.trim() || !candidate.intro.trim() || !candidate.sections.every(section => section && typeof section.title === "string" && typeof section.body === "string")) return null;
  return { title: candidate.title, intro: candidate.intro, sections: candidate.sections.map(section => ({ title: section.title, body: section.body })) };
}

export function cloneInformationPageContent(page: InformationPageContent): InformationPageContent {
  return { ...page, sections: page.sections.map(section => ({ ...section })) };
}

export const informationPages: Record<string, InformationPageContent> = {
  "about": { title: "من نحن", intro: "مكتبة دوت كوم متجر متخصص في الكتب التعليمية والمراجعات للطلاب في مصر.", sections: [{ title: "مهمتنا", body: "تسهيل الوصول إلى الكتاب المناسب بسعر ومخزون واضحين، وربط واجهة المتجر مباشرة بإدارة المكتبة." }, { title: "طريقة العمل", body: "تُدار المنتجات والأسعار والمخزون يدويًا من لوحة الإدارة، ويعمل الموقع بشكل مستقل حاليًا تمهيدًا لأي تكامل مستقبلي." }] },
  "contact": { title: "تواصل معنا", intro: "يسعدنا الرد على استفسارات المنتجات والطلبات.", sections: [] },
  "shipping-policy": { title: "سياسة الشحن", intro: "تُحسب تكلفة الشحن آليًا حسب المحافظة والمدينة ومحتويات السلة.", sections: [{ title: "التكلفة", body: "تظهر تكلفة الأساس وإضافة المدينة وأي خصم شحن قبل تأكيد الطلب، ويُحفظ Snapshot التسعير مع الطلب." }, { title: "الشحن المجاني", body: "يُطبق عند استيفاء قواعد المنتج أو الكوبون أو حد المحافظة. السلة المختلطة لا تصبح مجانية إلا إذا تحققت قاعدة كاملة." }, { title: "مدة التوصيل", body: "المدة المعروضة تقديرية حسب إعدادات المحافظة، ويؤكد فريق خدمة العملاء تفاصيل التسليم." }] },
  "return-policy": { title: "الإلغاء والاسترجاع", intro: "لا يستطيع العميل إلغاء الطلب المرسل مباشرة.", sections: [{ title: "طلب الإلغاء", body: "يمكن إرسال طلب إلغاء من صفحة تفاصيل الطلب قبل مراحل الشحن المتقدمة. يراجع موظف مخوّل الطلب ويوافق عليه أو يرفضه." }, { title: "الاسترجاع", body: "تُراجع حالات الاسترجاع مع خدمة العملاء وفق حالة الكتب والتغليف ومرحلة الطلب. لا تُنفذ تغييرات المخزون إلا من خلال الإجراءات الإدارية المسجلة." }] },
  "privacy": { title: "سياسة الخصوصية", intro: "نستخدم بياناتك فقط لتقديم الحساب والطلب والتوصيل وخدمة العملاء.", sections: [{ title: "البيانات", body: "قد نحفظ الاسم والهاتف والبريد وعناوين التوصيل وتاريخ الطلبات والمفضلة." }, { title: "الحماية", body: "تُخزن كلمات المرور بصورة مشفرة، وتُقيد صلاحيات الموظفين، وتُسجل الإجراءات المهمة لأغراض المراجعة." }, { title: "المشاركة", body: "لا نبيع بيانات العملاء. قد تُشارك بيانات التوصيل الضرورية مع شركة الشحن عند بدء التشغيل الفعلي." }] },
  "terms": { title: "الشروط والأحكام", intro: "باستخدام المتجر وإرسال الطلب أنت توافق على الشروط التالية.", sections: [{ title: "الأسعار والتوفر", body: "تُعرض الأسعار والمخزون من قاعدة البيانات، لكن يبقى الطلب خاضعًا للتحقق النهائي قبل التجهيز." }, { title: "الدفع", body: "يمكن تأكيد الطلب بتحويل 100 جنيه والباقي عند الاستلام، أو تحويل كامل القيمة. لا يعد التحويل مؤكدًا قبل مراجعته واعتماده من موظف." }, { title: "الفاتورة", body: "تصدر فاتورة بسيطة غير ضريبية باسم مكتبة دوت كوم." }] },
};

export const informationPageLabels: Record<string, string> = {
  "about": "من نحن", "contact": "تواصل معنا", "shipping-policy": "سياسة الشحن", "return-policy": "الإلغاء والاسترجاع", "privacy": "سياسة الخصوصية", "terms": "الشروط والأحكام",
};
