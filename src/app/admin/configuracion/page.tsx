import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
};

export default function ConfigPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Config />
    </Suspense>
  );
}

async function Config() {
  await requireAdmin();
  const config = await getConfig({ fresh: true });
  const keys = Object.keys(CONFIG_SCHEMA) as ConfigKey[];
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-extrabold">Configuración</h1>
      <p className="text-muted-foreground">Cada cambio queda registrado en la auditoría.</p>
      <div className="divide-y rounded-2xl border bg-card">
        {keys.map((key) => {
          const value = config[key];
          return (
            <form key={key} action={updateConfig} className="flex flex-wrap items-center gap-4 p-4">
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
              ) : (
                <>
                  <Input name="value" defaultValue={String(value)} className="w-40" />
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
