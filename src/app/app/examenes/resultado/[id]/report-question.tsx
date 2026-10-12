"use client";

import { FlagIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { REPORT_REASONS, type ReportReason } from "@/lib/exams/report-reasons";

import { reportQuestionAction } from "../../actions";

/** "Reportar pregunta": un formulario pequeño que se abre debajo de la pregunta. */
export function ReportQuestion({ attemptId, itemSetId, questionNumber }: { attemptId: string; itemSetId: string; questionNumber: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("WRONG_KEY");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) return <p className="text-xs text-muted-foreground">{done}</p>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <FlagIcon className="size-3" /> Reportar pregunta
      </button>
    );
  return (
    <form
      className="mt-2 space-y-2 rounded-xl border bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await reportQuestionAction({ attemptId, itemSetId, questionNumber, reason, note: note || undefined });
          setDone(r.ok ? "Gracias por avisarnos. Revisaremos esta pregunta." : r.error);
        });
      }}
    >
      <p className="text-xs font-semibold">¿Qué tiene de malo esta pregunta?</p>
      <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} className="h-8 w-full rounded-lg border bg-background px-2 text-sm" aria-label="Motivo">
        {Object.entries(REPORT_REASONS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Cuéntanos qué viste (opcional)"
        className="w-full rounded-lg border bg-background px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Enviar reporte
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
