import { MODULES } from "@/content/modules";
import { db } from "@/server/db";

export async function seedModules() {
  let lessons = 0;
  for (const [mi, m] of MODULES.entries()) {
    const moduleId = `${m.lang.toLowerCase()}-${m.slug}`;
    const data = {
      lang: m.lang,
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
  console.log(`✔ ${MODULES.length} módulos y ${lessons} lecciones`);
}
