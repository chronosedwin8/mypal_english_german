"use client";

import { FlagIcon } from "lucide-react";

import { renderMapSvg, type MapData } from "@/lib/render/svg";
import { cn } from "@/lib/utils";

export interface ExamOption {
  key: string;
  text: string;
}
export interface ExamGroup {
  taskType: string;
  instructions: string;
  title: string | null;
  wordLimit: number | null;
  sharedOptions: ExamOption[] | null;
  questions: { number: number; prompt: string; options: ExamOption[] | null }[];
}

const JUDGEMENTS: Record<string, string[]> = {
  TRUE_FALSE_NOT_GIVEN: ["TRUE", "FALSE", "NOT GIVEN"],
  YES_NO_NOT_GIVEN: ["YES", "NO", "NOT GIVEN"],
  RICHTIG_FALSCH: ["RICHTIG", "FALSCH"],
};
const COMPLETION = new Set(["SENTENCE_COMPLETION", "SUMMARY_COMPLETION", "NOTE_COMPLETION", "TABLE_COMPLETION", "FORM_COMPLETION", "SHORT_ANSWER", "GAP_FILL"]);

/** "Option A" no aporta nada: en mapas basta la letra. */
function optionLabel(o: ExamOption) {
  return /^option\s+\w{1,2}$/i.test(o.text.trim()) || o.text.trim() === o.key ? o.key : `${o.key} — ${o.text}`;
}

export const questionDomId = (blockId: string, n: number) => `q-${blockId.slice(0, 8)}-${n}`;

export function QuestionGroups(props: {
  blockId: string;
  groups: ExamGroup[];
  include: number[];
  map?: MapData | null;
  answers: Record<string, string>;
  flagged: Set<string>;
  disabled?: boolean;
  onAnswer: (number: number, value: string, opts?: { immediate?: boolean }) => void;
  onFlag: (number: number) => void;
}) {
  const groups = props.groups
    .map((g) => ({ ...g, questions: g.questions.filter((q) => props.include.includes(q.number)) }))
    .filter((g) => g.questions.length);

  return (
    <div className="space-y-8">
      {groups.map((g, gi) => {
        const nums = g.questions.map((q) => q.number);
        const judgement = JUDGEMENTS[g.taskType];
        return (
          <section key={gi} className="space-y-4">
            <div>
              <p className="text-sm font-bold">
                Questions {Math.min(...nums)}
                {nums.length > 1 && `–${Math.max(...nums)}`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{g.instructions}</p>
            </div>

            {g.taskType === "MAP_LABELLING" && props.map && (
              <div
                className="overflow-hidden rounded-xl border [&_svg]:h-auto [&_svg]:w-full"
                // SVG dibujado por nuestro codigo con texto escapado.
                dangerouslySetInnerHTML={{ __html: renderMapSvg(props.map) }}
              />
            )}

            {g.sharedOptions && g.taskType !== "MAP_LABELLING" && (
              <ul className="space-y-1 rounded-xl border bg-muted/30 p-3 text-sm">
                {g.sharedOptions.map((o) => (
                  <li key={o.key}>
                    <b className="mr-2 inline-block min-w-6">{o.key}</b>
                    {o.text}
                  </li>
                ))}
              </ul>
            )}

            {g.title && <p className="font-semibold">{g.title}</p>}

            <ol className="space-y-3">
              {g.questions.map((q) => {
                const id = questionDomId(props.blockId, q.number);
                const value = props.answers[String(q.number)] ?? "";
                const flagKey = `${props.blockId}:${q.number}`;
                const flagged = props.flagged.has(flagKey);
                return (
                  <li key={q.number} id={id} className={cn("scroll-mt-28 rounded-xl border bg-card p-3", flagged && "border-amber-400")}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-xs font-bold text-background">
                        {q.number}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2 text-sm">
                        {COMPLETION.has(g.taskType) ? (
                          <Completion prompt={q.prompt} value={value} disabled={props.disabled} label={`Pregunta ${q.number}`} onChange={(v, immediate) => props.onAnswer(q.number, v, { immediate })} />
                        ) : (
                          <p>{q.prompt}</p>
                        )}

                        {judgement && (
                          <div role="radiogroup" aria-label={`Pregunta ${q.number}`} className="flex flex-wrap gap-2">
                            {judgement.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                role="radio"
                                aria-checked={value === opt}
                                disabled={props.disabled}
                                onClick={() => props.onAnswer(q.number, opt, { immediate: true })}
                                className={cn(
                                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                                  value === opt ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                                )}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}

                        {q.options && (
                          <div role="radiogroup" aria-label={`Pregunta ${q.number}`} className="space-y-1.5">
                            {q.options.map((o) => (
                              <button
                                key={o.key}
                                type="button"
                                role="radio"
                                aria-checked={value === o.key}
                                disabled={props.disabled}
                                onClick={() => props.onAnswer(q.number, o.key, { immediate: true })}
                                className={cn(
                                  "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                                  value === o.key ? "border-primary bg-primary/10" : "hover:bg-muted",
                                )}
                              >
                                <b className="w-5 shrink-0">{o.key}</b>
                                <span>{o.text}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {g.sharedOptions && (
                          <select
                            aria-label={`Pregunta ${q.number}`}
                            value={value}
                            disabled={props.disabled}
                            onChange={(e) => props.onAnswer(q.number, e.target.value, { immediate: true })}
                            className="h-9 w-full max-w-xs rounded-lg border bg-background px-2 text-sm"
                          >
                            <option value="">Elige…</option>
                            {g.sharedOptions.map((o) => (
                              <option key={o.key} value={o.key}>
                                {optionLabel(o)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onFlag(q.number)}
                        aria-pressed={flagged}
                        title="Marcar para revisar"
                        className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-muted", flagged && "text-amber-500")}
                      >
                        <FlagIcon className="size-4" />
                        <span className="sr-only">Marcar para revisar</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function Completion(props: { prompt: string; value: string; disabled?: boolean; label: string; onChange: (v: string, immediate?: boolean) => void }) {
  const input = (
    <input
      aria-label={props.label}
      value={props.value}
      disabled={props.disabled}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      onChange={(e) => props.onChange(e.target.value)}
      onBlur={(e) => props.onChange(e.target.value, true)}
      className="mx-1 inline-block h-8 w-44 rounded-md border-b-2 border-primary/60 bg-muted/40 px-2 align-baseline text-sm focus:border-primary focus:outline-none"
    />
  );
  const [before, after] = props.prompt.split(/_{3,}/);
  if (after === undefined)
    return (
      <div className="space-y-2">
        <p>{props.prompt}</p>
        {input}
      </div>
    );
  return (
    <p className="leading-9">
      {before}
      {input}
      {after}
    </p>
  );
}
