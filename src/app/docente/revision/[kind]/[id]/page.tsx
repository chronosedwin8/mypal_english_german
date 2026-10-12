import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { OrgError } from "@/server/org";
import { requireStudentAccess } from "@/server/org/teaching";
import { storage } from "@/server/storage";

import { reviewAction } from "../../../actions";

export const metadata = { title: "Revisión docente" };

export default function ReviewPage(props: PageProps<"/docente/revision/[kind]/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
      <Review params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Review({ params, searchParams }: { params: PageProps<"/docente/revision/[kind]/[id]">["params"]; searchParams: PageProps<"/docente/revision/[kind]/[id]">["searchParams"] }) {
  const { kind, id } = await params;
  const sp = await searchParams;
  const groupId = typeof sp.grupo === "string" ? sp.grupo : "";
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  if (kind !== "writing" && kind !== "speaking") notFound();
  const user = await requireUser(`/docente/revision/${kind}/${id}`);
  const sub =
    kind === "writing"
      ? await db.writingSubmission.findUnique({ where: { id }, include: { attempt: true } })
      : await db.speakingSubmission.findUnique({ where: { id }, include: { attempt: true } });
  if (!sub) notFound();
  const member = await db.orgMember.findFirst({ where: { userId: sub.attempt.userId, status: "ACTIVE", role: "STUDENT" }, include: { user: true } });
  if (!member) notFound();
  try {
    await requireStudentAccess(user, member.id);
  } catch (err) {
    if (err instanceof OrgError) notFound();
    throw err;
  }
  const history = await db.teacherReview.findMany({ where: { submissionId: id }, orderBy: { createdAt: "desc" } });
  const feedback = sub.feedback as { criteria?: Record<string, { band: number; commentEs: string }>; criteriaLabels?: Record<string, string>; overviewEs?: string } | null;
  const ielts = sub.attempt.exam === "IELTS_ACADEMIC";
  const back = groupId ? `/docente/grupo/${groupId}` : "/docente";
  const seconds = (await getConfig())["exam.audioUrlSeconds"];
  const turns =
    kind === "speaking"
      ? await Promise.all(
          ((sub as { turns: unknown }).turns as { kind: string; text?: string; transcript?: string; audioKey?: string }[]).map(async (t) => ({
            who: t.kind,
            text: t.kind === "examiner" ? t.text : t.transcript,
            url: t.kind === "candidate" && t.audioKey ? await storage().signedUrl(t.audioKey, seconds) : null,
          })),
        )
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight">
          {kind === "writing" ? "Writing" : "Speaking"} de {member.user.name}
        </h1>
        <p className="text-muted-foreground">
          Nota de la IA: <b>{sub.finalScore ?? "—"}</b>
          {history[0] && (
            <>
              {" "}
              · tu nota vigente: <b>{history[0].score}</b>
            </>
          )}
        </p>
      </div>
      {aviso && <p className="rounded-2xl border bg-card px-4 py-3 text-sm">{aviso}</p>}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border bg-card p-6">
          {kind === "writing" ? (
            <p className="whitespace-pre-line text-[15px] leading-7">{(sub as { text: string }).text}</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {turns.map((t, i) => (
                <li key={i} className={t.who === "examiner" ? "rounded-xl bg-muted/60 px-3 py-2" : "rounded-xl bg-primary/10 px-3 py-2"}>
                  <span className="text-xs font-semibold text-muted-foreground">{t.who === "examiner" ? "Examinador" : "Estudiante"}</span>
                  <p>{t.text || "(sin respuesta)"}</p>
                  {t.url && <audio controls preload="none" src={t.url} className="mt-2 h-8 w-full" />}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-4">
          {feedback?.criteria && (
            <div className="rounded-3xl border bg-card p-5 text-sm">
              <p className="font-semibold">Calificación de la IA</p>
              <ul className="mt-2 space-y-2">
                {Object.entries(feedback.criteria).map(([k, v]) => (
                  <li key={k}>
                    <b>
                      {feedback.criteriaLabels?.[k] ?? k}: {v.band}
                    </b>
                    <span className="block text-muted-foreground">{v.commentEs}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form action={reviewAction} className="space-y-3 rounded-3xl border bg-card p-5">
            <input type="hidden" name="kind" value={kind.toUpperCase()} />
            <input type="hidden" name="submissionId" value={id} />
            <input type="hidden" name="back" value={back} />
            <label className="block text-sm font-medium">
              Tu nota ({ielts ? "banda 0–9" : sub.attempt.exam === "TESTDAF" ? "escala 0–20" : "puntos 0–100"})
              <input
                name="score"
                type="number"
                required
                step={ielts ? 0.5 : 1}
                min={0}
                max={ielts ? 9 : sub.attempt.exam === "TESTDAF" ? 20 : 100}
                defaultValue={history[0]?.score ?? sub.finalScore ?? undefined}
                className="mt-1 h-10 w-full rounded-xl border bg-background px-3"
              />
            </label>
            <label className="block text-sm font-medium">
              Motivo del ajuste
              <input name="reason" required minLength={3} placeholder="p. ej. no cumple el punto 3 de la tarea" className="mt-1 h-10 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="block text-sm font-medium">
              Comentario para el estudiante
              <Textarea name="comment" rows={4} className="mt-1" />
            </label>
            <Button type="submit" className="w-full">
              Guardar revisión
            </Button>
          </form>
          {history.length > 0 && (
            <div className="rounded-3xl border bg-card p-5 text-sm">
              <p className="font-semibold">Historial</p>
              <ul className="mt-2 space-y-1">
                {history.map((h) => (
                  <li key={String(h.id)} className="text-muted-foreground">
                    {h.createdAt.toLocaleDateString("es")}: {h.score} (IA {h.aiScore ?? "—"}) · {h.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
