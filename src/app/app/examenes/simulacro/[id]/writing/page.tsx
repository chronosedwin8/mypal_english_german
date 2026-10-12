import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { MockWriting } from "@/components/exam/mock-writing";
import { Skeleton } from "@/components/ui/skeleton";
import { esc, renderChartSvg, type ChartData } from "@/lib/render/svg";
import { requireUser } from "@/server/auth/dal";
import { MockError, mockView } from "@/server/exams/mock";
import { loadWriting } from "@/server/exams/writing";

export const metadata = { title: "Simulacro · Writing" };

export default function MockWritingPage(props: PageProps<"/app/examenes/simulacro/[id]/writing">) {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] w-full rounded-3xl" />}>
      <Writing params={props.params} />
    </Suspense>
  );
}

async function Writing({ params }: { params: PageProps<"/app/examenes/simulacro/[id]/writing">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/app/examenes/simulacro/${id}/writing`);
  let view;
  try {
    view = await mockView(id, user.id);
  } catch (err) {
    if (err instanceof MockError) notFound();
    throw err;
  }
  const stage = view.config.stages.WRITING;
  if (stage.status !== "ACTIVE") redirect(`/app/examenes/simulacro/${id}`);
  const tasks = await Promise.all(stage.attemptIds.map((a) => loadWriting(a, user.id)));
  if (tasks.some((t) => t.submission)) redirect(`/app/examenes/simulacro/${id}`);
  return (
    <div className="pb-16 md:pb-0">
      <h1 className="mb-4 font-heading text-2xl font-extrabold">Simulacro · Writing</h1>
      <MockWriting
        mockId={id}
        deadlineAt={tasks[0].deadlineAt!}
        serverNow={tasks[0].serverNow}
        tasks={tasks.map((t) => ({
          attemptId: t.attempt.id,
          task: t.config.part,
          minWords: t.minWords,
          draft: t.draft,
          promptHtml:
            `<p class="text-xs font-bold uppercase tracking-wide text-muted-foreground">Writing Task ${t.config.part} · ${t.minutes} minutos sugeridos</p>` +
            `<p style="white-space:pre-line">${esc(t.task.prompt)}</p>` +
            (t.task.chart ? `<div class="overflow-hidden rounded-xl border">${renderChartSvg(t.task.chart as ChartData)}</div>` : ""),
        }))}
      />
    </div>
  );
}
