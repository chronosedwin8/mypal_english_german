"use client";

import type { DiagnosticState } from "@/server/diagnostic/service";

export type { DiagnosticState };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function handle(res: Response): Promise<DiagnosticState> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? "Ocurrió un error.");
  }
  return data as DiagnosticState;
}

export const diagnosticApi = {
  start: (language: string, turnstileToken: string) =>
    fetch("/api/diagnostic/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, turnstileToken }),
    }).then(handle),
  state: (id: string) => fetch(`/api/diagnostic/${id}`, { cache: "no-store" }).then(handle),
  answer: (id: string, itemId: string, chosenIndex: number, latencyMs: number) =>
    fetch(`/api/diagnostic/${id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, chosenIndex, latencyMs }),
    }).then(handle),
  speaking: (id: string, taskId: string, audio: Blob, durationMs: number) => {
    const form = new FormData();
    form.append("taskId", taskId);
    form.append("durationMs", String(Math.round(durationMs)));
    form.append("audio", audio, `${taskId}.webm`);
    return fetch(`/api/diagnostic/${id}/speaking`, { method: "POST", body: form }).then(handle);
  },
  skipSpeaking: (id: string) => fetch(`/api/diagnostic/${id}/skip-speaking`, { method: "POST" }).then(handle),
};
