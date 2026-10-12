import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ExamScreen } from "@/components/exam/exam-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/dal";
import { PracticeError, loadPractice } from "@/server/exams/practice";

export const metadata = { title: "Práctica de examen" };

export default function PracticeAttemptPage(props: PageProps<"/app/examenes/practica/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh] w-full rounded-3xl" />}>
      <Attempt params={props.params} />
    </Suspense>
  );
}

async function Attempt({ params }: { params: PageProps<"/app/examenes/practica/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/app/examenes/practica/${id}`);
  let view;
  try {
    view = await loadPractice(id, user.id);
  } catch (err) {
    if (err instanceof PracticeError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  if (view.status !== "IN_PROGRESS") redirect(`/app/examenes/resultado/${id}`);
  return <ExamScreen view={view} />;
}
