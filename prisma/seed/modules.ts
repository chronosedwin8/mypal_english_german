import { EXAMINER_MODULES, KIDS_MODULES, MODULES } from "@/content/modules";
import { db } from "@/server/db";

export async function seedModules() {
  let lessons = 0;
  const all = [...MODULES, ...KIDS_MODULES, ...EXAMINER_MODULES];
  for (const [mi, m] of all.entries()) {
    const moduleId = `${m.lang.toLowerCase()}-${m.slug}`;
    const data = {
      lang: m.lang,
      audience: m.audience ?? "ADULT",
      level: m.level,
      slug: m.slug,
      titleEs: m.titleEs,
      descriptionEs: m.descriptionEs,
      emoji: m.emoji,
      sortOrder: mi,
      isPublished: true,
    };
    await db.module.upsert({ where: { id: moduleId }, create: { id: moduleId, ...data }, update: data });
    for (const [li, l] of m.lessons.entries()) {
      const lessonId = `${moduleId}-${l.slug}`;
      const ldata = {
        moduleId,
        slug: l.slug,
        titleEs: l.titleEs,
        objectives: l.objectives,
        targetVocab: l.targetVocab,
        tutorBrief: l.tutorBrief,
        usesVision: Boolean(l.usesVision),
        suggestedMinutes: l.suggestedMinutes,
        sortOrder: li,
      };
      await db.lesson.upsert({ where: { id: lessonId }, create: { id: lessonId, ...ldata }, update: ldata });
      lessons++;
    }
  }
  console.log(`✔ ${all.length} módulos y ${lessons} lecciones (incluye niños)`);
}
