import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultHomepageLayout, homepageLayoutSchema, parseHomepageLayout } from "./homepage-layout";

test("homepage layout defaults focus on secondary and baccalaureate while keeping ordered subjects and models", () => {
  const layout = createDefaultHomepageLayout({
    stages: [{ id: 1, nameAr: "ابتدائي" }, { id: 2, nameAr: "ثانوي" }, { id: 3, nameAr: "بكالوريا" }],
    grades: [{ id: 10, nameAr: "الأول الثانوي", stageId: 2 }, { id: 11, nameAr: "الثاني الثانوي", stageId: 2 }, { id: 12, nameAr: "الأول بكالوريا", stageId: 3 }],
    subjects: [{ id: 20, nameAr: "الرياضيات" }, { id: 21, nameAr: "الفيزياء" }],
    teacherIds: [30, 31],
    productIds: [40, 41, 42, 43],
  });
  assert.deepEqual(layout.stages.itemIds, [2, 3]);
  assert.deepEqual(layout.grades.itemIds, [10, 11, 12]);
  assert.deepEqual(layout.discovery.models.map(model => model.productId), [40, 41, 42]);
  assert.deepEqual(layout.subjects.itemIds, [20, 21]);
});

test("homepage layout validation rejects duplicate items and duplicate model products", () => {
  const base = createDefaultHomepageLayout({ stages: [{ id: 1, nameAr: "ثانوي" }], grades: [], subjects: [], teacherIds: [], productIds: [10, 11] });
  assert.equal(homepageLayoutSchema.safeParse({ ...base, stages: { ...base.stages, itemIds: [1, 1] } }).success, false);
  assert.equal(homepageLayoutSchema.safeParse({ ...base, discovery: { ...base.discovery, models: [{ productId: 10 }, { productId: 10 }] } }).success, false);
});

test("invalid stored JSON falls back safely", () => {
  assert.equal(parseHomepageLayout("not-json"), null);
  assert.equal(parseHomepageLayout(JSON.stringify({ discovery: {} })), null);
});
