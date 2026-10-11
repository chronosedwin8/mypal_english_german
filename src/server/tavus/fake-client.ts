/**
 * Simulador de Tavus (TAVUS_DRIVER=fake): para tests y para desarrollar la app
 * sin gastar minutos. Imita los cortes por max_call_duration y por ausencia.
 * El estado vive en globalThis para sobrevivir recargas en desarrollo.
 */
import { randomBytes } from "node:crypto";

import {
  TavusApiError,
  type TavusClient,
  type TavusConversation,
  type TavusConversationCreate,
  type TavusConversationDetail,
  type TavusPalRecord,
} from "./types";

interface FakeConv {
  id: string;
  name: string;
  palId: string;
  createdAt: number;
  endedAt: number | null;
  shutdownReason: string | null;
  maxCallMs: number;
  context: string;
}

interface FakeState {
  convs: Map<string, FakeConv>;
  pals: Map<string, TavusPalRecord>;
  tools: Map<string, { tool_id: string; name: string }>;
  /** Fallos programables para tests. */
  failNextCreate: null | "definite" | "timeout" | "timeout-but-created" | "concurrency";
  now: () => number;
}

const g = globalThis as unknown as { __fakeTavus?: FakeState };

export function fakeState(): FakeState {
  if (!g.__fakeTavus) {
    g.__fakeTavus = {
      convs: new Map(),
      pals: new Map(),
      tools: new Map(),
      failNextCreate: null,
      now: () => Date.now(),
    };
  }
  return g.__fakeTavus;
}

export function resetFakeTavus() {
  g.__fakeTavus = undefined;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function tick(c: FakeConv, now: number) {
  if (c.endedAt === null && now - c.createdAt >= c.maxCallMs) {
    c.endedAt = c.createdAt + c.maxCallMs;
    c.shutdownReason = "max_call_duration reached";
  }
}

function toPublic(c: FakeConv): TavusConversation {
  return {
    conversation_id: c.id,
    conversation_name: c.name,
    conversation_url: `fake://tavus/${c.id}`,
    status: c.endedAt === null ? "active" : "ended",
    created_at: iso(c.createdAt),
    updated_at: iso(c.endedAt ?? c.createdAt),
    meeting_token: "fake-token",
  };
}

export class FakeTavusClient implements TavusClient {
  readonly driver = "fake" as const;

  async getPal(palId: string) {
    const s = fakeState();
    if (palId.startsWith("p") && !s.pals.has(palId)) {
      s.pals.set(palId, { pal_id: palId, pal_name: "Fake base", default_face_id: "rfake000001", languages: ["en", "es", "de"] });
    }
    return s.pals.get(palId) ?? null;
  }

  async createPal(spec: Record<string, unknown>) {
    const id = `p${randomBytes(6).toString("hex")}`;
    const rec = { ...spec, pal_id: id } as TavusPalRecord;
    fakeState().pals.set(id, rec);
    return rec;
  }

  async patchPal() {}

  async listTools() {
    return [...fakeState().tools.values()];
  }

  async createTool(tool: { name: string }) {
    const t = { tool_id: `t${randomBytes(6).toString("hex")}`, name: tool.name };
    fakeState().tools.set(t.tool_id, t);
    return t;
  }

  async attachTools() {}

  async attachSkill() {}

  async createConversation(body: TavusConversationCreate) {
    const s = fakeState();
    const mode = s.failNextCreate;
    s.failNextCreate = null;
    if (mode === "definite") throw new TavusApiError("Tavus 400: fallo simulado", 400, true);
    if (mode === "concurrency") throw new TavusApiError("Tavus 429: concurrency limit", 429, true);
    if (mode === "timeout") throw new TavusApiError("Tavus sin respuesta (simulado)", 0, false);
    const c: FakeConv = {
      id: `c${randomBytes(7).toString("hex")}`,
      name: body.conversation_name,
      palId: body.pal_id,
      createdAt: s.now(),
      endedAt: body.test_mode ? s.now() : null,
      shutdownReason: body.test_mode ? "test_mode" : null,
      maxCallMs: body.properties.max_call_duration * 1000,
      context: body.conversational_context ?? "",
    };
    s.convs.set(c.id, c);
    if (mode === "timeout-but-created") throw new TavusApiError("Tavus sin respuesta (pero se creo)", 0, false);
    return toPublic(c);
  }

  async endConversation(conversationId: string) {
    const s = fakeState();
    const c = s.convs.get(conversationId);
    if (!c) return;
    tick(c, s.now());
    if (c.endedAt === null) {
      c.endedAt = s.now();
      c.shutdownReason = "end_conversation endpoint hit";
    }
  }

  async getConversation(conversationId: string): Promise<TavusConversationDetail | null> {
    const s = fakeState();
    const c = s.convs.get(conversationId);
    if (!c) return null;
    tick(c, s.now());
    const events =
      c.endedAt === null
        ? []
        : [
            {
              event_type: "system.shutdown",
              message_type: "system",
              timestamp: iso(c.endedAt),
              properties: { reason: c.shutdownReason, shutdown_reason: c.shutdownReason },
            },
            {
              event_type: "application.transcription_ready",
              message_type: "application",
              timestamp: iso(c.endedAt),
              properties: {
                transcript: [
                  { role: "assistant", content: "Hi! Lovely to meet you. What's your name?", seconds_from_start: 1 },
                  { role: "user", content: "Hi, my name is Ana.", seconds_from_start: 5 },
                ],
              },
            },
          ];
    return { ...toPublic(c), events };
  }

  async listConversations(opts: { status?: "active" | "ended" }) {
    const s = fakeState();
    const all = [...s.convs.values()];
    all.forEach((c) => tick(c, s.now()));
    return all
      .filter((c) => !opts.status || (opts.status === "active" ? c.endedAt === null : c.endedAt !== null))
      .map(toPublic);
  }
}
