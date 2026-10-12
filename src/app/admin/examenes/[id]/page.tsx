import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { renderChartSvg, renderMapSvg, type ChartData, type MapData } from "@/lib/render/svg";
import { examBlockDetail } from "@/server/admin/exams";
import { requireStaff } from "@/server/auth/dal";
import type { JudgeVerdict, QaRound } from "@/server/exams/bank/pipeline";
import type { PublicGroup, QuestionKey } from "@/server/exams/bank/schemas";

import { regenerateAudio, reviewBlock } from "../actions";

export const metadata = { title: "Admin · Bloque del banco" };

export default function BlockPage(props: PageProps<"/admin/examenes/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Block params={props.params} />
    </Suspense>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- el contenido es JSON validado al generarse */
async function Block({ params }: { params: PageProps<"/admin/examenes/[id]">["params"] }) {
  await requireStaff();
  const { id } = await params;
  const detail = await examBlockDetail(id);
  if (!detail) notFound();
  const { item, audio, inForms } = detail;
  const content = item.content as any;
  const key = item.answerKey as any;
  const qa = key.qa as { targetBand: number; domain: string; rounds: QaRound[] } | undefined;
  const judge: JudgeVerdict | undefined = qa?.rounds.findLast((r) => r.judge)?.judge;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/examenes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Banco de exámenes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-extrabold">{item.topic}</h1>
          <StatusBadge status={item.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.exam} · {item.section} parte {item.part} · banda {item.difficulty.toFixed(1)} · {item.model} · {item.promptVersion} · costo $
          {(Number(item.costMicroUsd) / 1e6).toFixed(3)}
          {inForms.length > 0 && ` · en forma ${inForms.join(", ")}`}
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="font-semibold">Control de calidad</h2>
          {qa ? (
            <>
              <p className="text-muted-foreground">
                Banda objetivo {qa.targetBand} · área: {qa.domain}
              </p>
              {qa.rounds.map((r, i) => (
                <div key={i} className="rounded-xl bg-muted/50 p-3">
                  <p className="font-medium">
                    Ronda {i + 1}
                    {r.solver && ` · resolutor ${(r.solver.agreement * 100).toFixed(0)} %`}
                    {r.judge && ` · juez ${r.judge.overall.toFixed(1)}`}
                  </p>
                  {r.issues.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-rose-700 dark:text-rose-300">
                      {r.issues.map((x, j) => (
                        <li key={j}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {judge && (
                <div>
                  <p>
                    Autenticidad {judge.authenticity} · nivel {judge.levelFit} · claridad {judge.clarity} · equidad {judge.fairness}
                  </p>
                  {judge.problems.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {judge.problems.map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Sin informe.</p>
          )}
          {item.reviewNote && <p className="whitespace-pre-line rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{item.reviewNote}</p>}
        </div>

        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Revisión</h2>
          <form action={reviewBlock} className="space-y-2">
            <input type="hidden" name="id" value={item.id} />
            <Textarea name="note" placeholder="Nota (opcional): qué está mal o qué se revisó" rows={3} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="decision" value="APPROVED" size="sm">
                Aprobar
              </Button>
              <Button type="submit" name="decision" value="REJECTED" size="sm" variant="outline">
                Rechazar
              </Button>
              <Button type="submit" name="decision" value="RETIRED" size="sm" variant="ghost">
                Retirar
              </Button>
            </div>
          </form>
          {item.section === "LISTENING" && (
            <form action={regenerateAudio}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" size="sm" variant="outline" className="w-full">
                Regenerar audio
              </Button>
            </form>
          )}
        </div>
      </section>

      {audio.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Audio</h2>
          {audio.map((a, i) => (
            <div key={a.id} className="rounded-2xl border bg-card p-4 text-sm">
              <p className="mb-2 text-muted-foreground">
                Tramo {i + 1} · {(a.durationMs / 1000).toFixed(0)} s · {a.characters} caracteres · Scribe reconoce{" "}
                {((a.transcriptCheck ?? 0) * 100).toFixed(1)} % del guion · voces:{" "}
                {Object.entries(a.voices as Record<string, { name: string }>)
                  .map(([k, v]) => `${k}=${v.name}`)
                  .join(", ")}
              </p>
              <audio controls preload="none" src={a.url} className="w-full" />
            </div>
          ))}
        </section>
      )}

      {content.kind === "reading" && (
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-xl font-bold">{content.passage.title}</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed">
            {content.passage.paragraphs.map((p: { label: string; text: string }) => (
              <p key={p.label}>
                <b className="mr-2">{p.label}</b>
                {p.text}
              </p>
            ))}
          </div>
        </section>
      )}

      {content.kind === "listening" && (
        <section className="space-y-4 rounded-2xl border bg-card p-6 text-sm">
          <h2 className="font-semibold">Guion</h2>
          <p className="text-muted-foreground">{content.context}</p>
          {(key.segments as { questionsFrom: number; questionsTo: number; lines: { speaker: string; text: string }[] }[]).map((s, i) => (
            <div key={i} className="space-y-1">
              <p className="font-medium">
                Tramo {i + 1}: preguntas {s.questionsFrom}–{s.questionsTo}
              </p>
              {s.lines.map((l, j) => (
                <p key={j}>
                  <b className="mr-1">{l.speaker === "NARRATOR" ? "Narrador" : (content.speakers.find((x: { id: string }) => x.id === l.speaker)?.name ?? l.speaker)}:</b>
                  {l.text}
                </p>
              ))}
            </div>
          ))}
          {content.map && <Svg svg={renderMapSvg(content.map as MapData)} />}
        </section>
      )}

      {(content.kind === "reading" || content.kind === "listening") && <Questions groups={content.groups} keys={key.questions} />}

      {content.kind === "writing1" && (
        <section className="space-y-4 rounded-2xl border bg-card p-6 text-sm">
          <p className="font-medium">{content.prompt}</p>
          <Svg svg={renderChartSvg(content.chart as ChartData)} />
          <Answer title="Rasgos clave" items={key.keyFeatures} />
          <Model text={key.modelAnswer} />
        </section>
      )}
      {content.kind === "writing2" && (
        <section className="space-y-4 rounded-2xl border bg-card p-6 text-sm">
          <p className="font-medium">{content.prompt}</p>
          <p className="text-muted-foreground">Tipo: {content.essayType}</p>
          <Answer title="Ideas clave" items={key.keyIdeas} />
          <Model text={key.modelAnswer} />
        </section>
      )}
      {content.kind === "speaking1" && (
        <section className="space-y-4 rounded-2xl border bg-card p-6 text-sm">
          {content.frames.map((f: { topic: string; questions: string[] }) => (
            <Answer key={f.topic} title={f.topic} items={f.questions} />
          ))}
        </section>
      )}
      {content.kind === "speaking2" && (
        <section className="space-y-4 rounded-2xl border bg-card p-6 text-sm">
          <div className="rounded-xl border-2 border-dashed p-4">
            <p className="font-semibold">{content.card.task}</p>
            <p className="mt-2">You should say:</p>
            <ul className="list-disc pl-5">
              {content.card.cuePoints.map((c: string) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-2">{content.card.finalLine}</p>
          </div>
          <Answer title="Preguntas de cierre" items={content.roundingOff} />
          {content.discussion.map((d: { theme: string; questions: string[] }) => (
            <Answer key={d.theme} title={`Parte 3 · ${d.theme}`} items={d.questions} />
          ))}
        </section>
      )}
    </div>
  );
}

function Svg({ svg }: { svg: string }) {
  // SVG dibujado por nuestro codigo a partir de datos (todo el texto va escapado).
  return <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Answer({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Model({ text }: { text: string }) {
  return (
    <details className="rounded-xl bg-muted/50 p-3">
      <summary className="cursor-pointer font-semibold">Respuesta modelo</summary>
      <p className="mt-2 whitespace-pre-line leading-relaxed">{text}</p>
    </details>
  );
}

function Questions({ groups, keys }: { groups: PublicGroup[]; keys: Record<string, QuestionKey> }) {
  return (
    <section className="space-y-6">
      {groups.map((g, gi) => (
        <div key={gi} className="rounded-2xl border bg-card p-6 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.taskType}</p>
          <p className="mt-1 font-medium">{g.instructions}</p>
          {g.title && <p className="mt-2 font-semibold">{g.title}</p>}
          {g.sharedOptions && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {g.sharedOptions.map((o) => (
                <li key={o.key}>
                  <b>{o.key}</b> {o.text}
                </li>
              ))}
            </ul>
          )}
          <ol className="mt-4 space-y-3">
            {g.questions.map((q) => {
              const k = keys[String(q.number)];
              return (
                <li key={q.number} className="rounded-xl bg-muted/40 p-3">
                  <p>
                    <b className="mr-2">{q.number}.</b>
                    {q.prompt}
                  </p>
                  {q.options && (
                    <ul className="mt-1 pl-6">
                      {q.options.map((o) => (
                        <li key={o.key}>
                          <b>{o.key}</b> {o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-emerald-700 dark:text-emerald-300">
                    Clave: <b>{k?.answers.join(" / ")}</b>
                  </p>
                  <p className="text-muted-foreground">
                    Evidencia: “{k?.evidence}” — {k?.explanationEs}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
