import { z } from "@workspace/api-zod";

export const HOMEPAGE_LAYOUT_SETTING_KEY = "homepage.layout.v1";

const orderedIds = (maximum = 100) => z.array(z.number().int().positive()).max(maximum).refine(
  values => new Set(values).size === values.length,
  "لا يمكن تكرار العنصر داخل القسم",
);

const optionalImageUrl = z.string().trim().max(2_000).nullable().refine(
  value => !value || (value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\//i.test(value),
  "رابط الصورة غير صحيح",
);

export const homepageModelSchema = z.object({
  productId: z.number().int().positive(),
  imageUrl: optionalImageUrl.default(null),
  imageStorageKey: z.string().trim().max(1_000).nullable().default(null),
  caption: z.string().trim().max(300).nullable().default(null),
});

const sectionSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(2).max(200),
  subtitle: z.string().trim().max(500).nullable(),
  itemIds: orderedIds(),
});

export const homepageLayoutSchema = z.object({
  discovery: z.object({
    enabled: z.boolean(),
    badgeText: z.string().trim().min(2).max(120),
    title: z.string().trim().min(2).max(300),
    description: z.string().trim().min(2).max(800),
    secondaryTitle: z.string().trim().min(2).max(120),
    baccalaureateTitle: z.string().trim().min(2).max(120),
    teachersTitle: z.string().trim().min(2).max(120),
    secondaryGradeIds: orderedIds(12),
    baccalaureateGradeIds: orderedIds(12),
    teacherIds: orderedIds(30),
    models: z.array(homepageModelSchema).max(3).refine(
      values => new Set(values.map(value => value.productId)).size === values.length,
      "لا يمكن اختيار نفس المنتج في أكثر من مجسم",
    ),
  }),
  stages: sectionSchema,
  grades: sectionSchema,
  subjects: sectionSchema,
});

export type HomepageLayout = z.infer<typeof homepageLayoutSchema>;

type NamedOption = { id: number; nameAr: string; stageId?: number | null };

export function createDefaultHomepageLayout(input: {
  stages: NamedOption[];
  grades: NamedOption[];
  subjects: NamedOption[];
  teacherIds: number[];
  productIds: number[];
}): HomepageLayout {
  const focusedStages = input.stages.filter(stage => /ثانو|بكالوريا/i.test(stage.nameAr));
  const selectedStages = focusedStages.length ? focusedStages : input.stages;
  const secondaryStage = input.stages.find(stage => /ثانو/i.test(stage.nameAr));
  const baccalaureateStage = input.stages.find(stage => /بكالوريا/i.test(stage.nameAr));
  const focusedGrades = input.grades.filter(grade => selectedStages.some(stage => stage.id === grade.stageId));

  return {
    discovery: {
      enabled: true,
      badgeText: "تجربة تسوق تعليمية أذكى",
      title: "اكتشف احتياجاتك الدراسية بطريقة أسرع",
      description: "الصفوف والتصنيفات والمدرسون المعروضون هنا يتم التحكم فيهم بالكامل من لوحة الإدارة.",
      secondaryTitle: "الثانوية العامة",
      baccalaureateTitle: "نظام البكالوريا",
      teachersTitle: "كتب المدرسين",
      secondaryGradeIds: input.grades.filter(grade => grade.stageId === secondaryStage?.id).slice(0, 3).map(grade => grade.id),
      baccalaureateGradeIds: input.grades.filter(grade => grade.stageId === baccalaureateStage?.id).slice(0, 2).map(grade => grade.id),
      teacherIds: input.teacherIds.slice(0, 5),
      models: input.productIds.slice(0, 3).map(productId => ({ productId, imageUrl: null, imageStorageKey: null, caption: null })),
    },
    stages: {
      enabled: true,
      title: "اختَر نظامك الدراسي",
      subtitle: "كتب الثانوية العامة ونظام البكالوريا في مكان واحد",
      itemIds: selectedStages.slice(0, 8).map(stage => stage.id),
    },
    grades: {
      enabled: true,
      title: "الصفوف المتاحة",
      subtitle: null,
      itemIds: focusedGrades.slice(0, 12).map(grade => grade.id),
    },
    subjects: {
      enabled: true,
      title: "تصفح حسب المادة",
      subtitle: null,
      itemIds: input.subjects.slice(0, 12).map(subject => subject.id),
    },
  };
}

export function parseHomepageLayout(value: string | null | undefined): HomepageLayout | null {
  if (!value) return null;
  try {
    const parsed = homepageLayoutSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
