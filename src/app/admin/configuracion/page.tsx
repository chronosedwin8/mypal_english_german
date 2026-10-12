import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/server/auth/dal";
import { CONFIG_SCHEMA, getConfig, type ConfigKey } from "@/server/config";

import { updateConfig } from "../actions";

export const metadata = { title: "Admin · Configuración" };

const LABELS: Partial<Record<ConfigKey, string>> = {
  "tavus.killSwitch": "⛔ Interruptor de emergencia (pausa todas las clases nuevas)",
  "trial.enabled": "Prueba gratis activa",
  "trial.seconds": "Duración de la prueba gratis (segundos)",
  "trial.requireDiagnostic": "La prueba exige test de nivel",
  "trial.maxPerIpPrefix30d": "Pruebas por red IP cada 30 días",
  "trial.dailyBudgetSeconds": "Presupuesto diario de pruebas (segundos)",
  "concurrency.limit": "Clases simultáneas (= plan de Tavus)",
  "tavus.tier": "Plan de Tavus contratado (builder | growth | business)",
  "tavus.planMaxSessionSeconds": "Máximo por conversación del plan Tavus (segundos)",
  "tavus.costPerMinMicroUsd": "Costo Tavus por minuto (micro-USD; 350000 = $0,35)",
  "tavus.monthlyBudgetSeconds": "Presupuesto mensual de minutos Tavus (segundos)",
  "session.safetyMarginSeconds": "Margen de seguridad por clase (segundos)",
  "session.minStartSeconds": "Saldo mínimo para iniciar (segundos)",
  "session.participantAbsentTimeout": "Cerrar si nadie entra en (segundos)",
  "session.participantLeftTimeout": "Cerrar tras salir en (segundos)",
  "session.heartbeatStaleSeconds": "Cerrar sin latido del navegador en (segundos)",
  "queue.offerSeconds": "Tiempo para reclamar un cupo ofrecido (segundos)",
  "billing.chargeNoShow": "Cobrar si el usuario no entra a la clase creada",
  "diagnostic.maxAttemptsPerIpPerDay": "Tests de nivel por IP al día",
  "diagnostic.speakingEnabled": "Parte oral del test (ElevenLabs Scribe)",
  "diagnostic.maxSpeakingSeconds": "Máximo por grabación del test (segundos)",
  "ai.model.generate": "Modelo de IA para generar el banco",
  "ai.model.grade": "Modelo de IA para calificar Writing y Speaking",
  "ai.model.solve": "Modelo de IA del resolutor a ciegas",
  "ai.model.judge": "Modelo de IA del juez de estilo",
  "ai.model.examiner": "Modelo de IA del examinador por voz",
  "ai.pricing": "Precios por millón de tokens de cada modelo (USD, JSON)",
  "ai.dailyBudgetUsd": "Tope diario de gasto en IA y voz (USD)",
  "voice.ttsUsdPer1kChars": "Costo de voz ElevenLabs por 1.000 caracteres (USD)",
  "voice.sttUsdPerHour": "Costo de Scribe por hora de audio (USD)",
  "voice.monthlyCharBudget": "Tope mensual de caracteres de voz del banco",
  "exam.enabled": "Exámenes activos",
  "exam.enabledExams": "Exámenes disponibles (JSON)",
  "exam.bank.minPerPart": "Bloques aprobados mínimos por parte",
  "exam.bank.autoGenerate": "El worker repone el banco automáticamente (gasta IA)",
  "exam.bank.humanReviewSample": "Fracción de bloques que va a revisión humana (0–1)",
  "exam.bank.judgeMinScore": "Puntaje mínimo del juez para publicar (0–10)",
  "exam.bank.reviewBelowClarity": "Claridad bajo la cual un bloque va a revisión (0–10)",
  "exam.bank.targetBands": "Bandas objetivo del banco IELTS (JSON)",
  "exam.bank.solverMinAgreement": "Aciertos mínimos del resolutor a ciegas (0,5–1)",
  "exam.bank.audioMinMatch": "Coincidencia mínima audio/guion según Scribe (0–1)",
  "exam.audio.maxCharsPerRequest": "Caracteres por solicitud de audio a ElevenLabs",
  "exam.speaking.part1Questions": "Speaking: preguntas de la Parte 1",
  "exam.speaking.part3Questions": "Speaking: preguntas de la Parte 3 (con repreguntas)",
  "exam.speaking.answerSeconds": "Speaking: segundos máximos por respuesta",
  "exam.speaking.longTurnSeconds": "Speaking: segundos máximos de la Parte 2",
  "exam.speaking.maxPrepSeconds": "Speaking: preparación máxima en práctica (segundos)",
  "exam.freePractices": "Prácticas de examen gratis sin plan",
  "exam.adhoc.dailyPerUser": "Generaciones al momento por usuario y día",
  "exam.writing.task2Weight": "Peso de Writing Tarea 2 frente a Tarea 1",
  "exam.testdaf.cutoffs": "Cortes estimados TestDaF → TDN (JSON)",
  "exam.audioUrlSeconds": "Validez de las URLs de audio (segundos)",
  "exam.listening.readSeconds": "Tiempo para leer las preguntas antes de cada audio (segundos)",
  "study.hoursPerBand": "Plan de estudios: horas para subir una banda (supuesto)",
  "study.defaultWeeks": "Plan de estudios: semanas a planear sin fecha de examen",
  "kids.maxSessionSeconds": "Máximo por clase en modo niños (segundos)",
};

export default function ConfigPage(props: PageProps<"/admin/configuracion">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Config searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Config({ searchParams }: { searchParams: PageProps<"/admin/configuracion">["searchParams"] }) {
  await requireAdmin();
  const { error } = await searchParams;
  const config = await getConfig({ fresh: true });
  const keys = Object.keys(CONFIG_SCHEMA) as ConfigKey[];
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-extrabold">Configuración</h1>
      <p className="text-muted-foreground">Cada cambio queda registrado en la auditoría.</p>
      {typeof error === "string" && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="divide-y rounded-2xl border bg-card">
        {keys.map((key) => {
          const value = config[key];
          return (
            <form key={key} id={key} action={updateConfig} className="flex flex-wrap items-center gap-4 p-4">
              <input type="hidden" name="key" value={key} />
              <div className="min-w-64 flex-1">
                <p className="font-medium">{LABELS[key] ?? key}</p>
                <p className="font-mono text-xs text-muted-foreground">{key}</p>
              </div>
              {typeof value === "boolean" ? (
                <>
                  <input type="hidden" name="value" value={value ? "false" : "true"} />
                  <span className="text-sm font-semibold">{value ? "Sí" : "No"}</span>
                  <Button type="submit" size="sm" variant={key === "tavus.killSwitch" && !value ? "destructive" : "outline"}>
                    {value ? "Desactivar" : "Activar"}
                  </Button>
                </>
              ) : typeof value === "object" && value !== null ? (
                <>
                  <Textarea
                    name="value"
                    defaultValue={JSON.stringify(value, null, 2)}
                    rows={Math.min(8, JSON.stringify(value, null, 2).split("\n").length)}
                    spellCheck={false}
                    className="w-full max-w-md font-mono text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline">Guardar</Button>
                </>
              ) : (
                <>
                  <Input name="value" defaultValue={String(value)} className={typeof value === "string" ? "w-64" : "w-40"} />
                  <Button type="submit" size="sm" variant="outline">Guardar</Button>
                </>
              )}
            </form>
          );
        })}
      </div>
    </div>
  );
}
