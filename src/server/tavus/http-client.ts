/**
 * Cliente HTTP de Tavus. La clave solo vive en el servidor (TAVUS_API_KEY).
 * IMPORTANTE: crear conversaciones NUNCA se reintenta (podria cobrarse dos veces).
 */
import {
  TavusApiError,
  type TavusClient,
  type TavusConversation,
  type TavusConversationCreate,
  type TavusConversationDetail,
  type TavusPalRecord,
  type TavusToolCreate,
} from "./types";

const BASE = "https://tavusapi.com/v2";

function key(): string {
  const k = process.env.TAVUS_API_KEY?.trim();
  if (!k) throw new TavusApiError("Falta TAVUS_API_KEY en .env", 0, true);
  return k;
}

async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<{ status: number; data: T | null }> {
  const retries = init.retries ?? 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { "x-api-key": key(), "Content-Type": "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as T) : null;
      if (res.ok) return { status: res.status, data };
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      const msg = (data as { message?: string; error?: string } | null)?.message ?? (data as { error?: string } | null)?.error;
      // 4xx = Tavus rechazo la peticion: con certeza no se creo nada.
      throw new TavusApiError(`Tavus ${res.status}: ${msg ?? text.slice(0, 200)}`, res.status, res.status < 500);
    } catch (err) {
      if (err instanceof TavusApiError) throw err;
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
    }
  }
  // Timeout o red: NO sabemos si la operacion ocurrio.
  throw new TavusApiError(`Tavus sin respuesta: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`, 0, false);
}

export class HttpTavusClient implements TavusClient {
  readonly driver = "http" as const;

  async getPal(palId: string) {
    try {
      const { data } = await call<TavusPalRecord & { data?: TavusPalRecord }>(`/pals/${palId}`, { retries: 2 });
      return data?.data ?? data;
    } catch (e) {
      if (e instanceof TavusApiError && (e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  }

  async createPal(spec: Record<string, unknown>) {
    const { data } = await call<TavusPalRecord>(`/pals`, { method: "POST", body: JSON.stringify(spec), timeoutMs: 30_000 });
    if (!data?.pal_id) throw new TavusApiError("Tavus no devolvio pal_id", 500, false);
    return data;
  }

  async patchPal(palId: string, ops: { op: string; path: string; value?: unknown }[]) {
    if (!ops.length) return;
    await call(`/pals/${palId}`, { method: "PATCH", body: JSON.stringify(ops), timeoutMs: 30_000 });
  }

  async listTools() {
    const { data } = await call<{ data?: { tool_id: string; name: string }[] } | { tool_id: string; name: string }[]>(
      `/tools?limit=100`,
      { retries: 2 },
    );
    if (Array.isArray(data)) return data;
    return data?.data ?? [];
  }

  async createTool(tool: TavusToolCreate) {
    const { data } = await call<{ tool_id: string; name: string; tool?: { tool_id: string; name: string } }>(`/tools`, {
      method: "POST",
      body: JSON.stringify(tool),
    });
    const t = data?.tool ?? data;
    if (!t?.tool_id) throw new TavusApiError("Tavus no devolvio tool_id", 500, false);
    return { tool_id: t.tool_id, name: t.name };
  }

  async attachTools(palId: string, toolIds: string[]) {
    if (!toolIds.length) return;
    await call(`/pals/${palId}/tools`, { method: "POST", body: JSON.stringify({ tool_ids: toolIds }), retries: 2 });
  }

  async attachSkill(palId: string, skillId: string, config?: Record<string, unknown>) {
    await call(`/pals/${palId}/skills/${skillId}`, {
      method: "PUT",
      body: JSON.stringify(config ? { config } : {}),
      retries: 2,
    });
  }

  async createConversation(body: TavusConversationCreate): Promise<TavusConversation> {
    // Sin reintentos: un reintento podria crear (y cobrar) una segunda conversacion.
    const { data } = await call<TavusConversation>(`/conversations`, {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 20_000,
      retries: 0,
    });
    if (!data?.conversation_id) throw new TavusApiError("Tavus no devolvio conversation_id", 500, false);
    return data;
  }

  async endConversation(conversationId: string) {
    try {
      await call(`/conversations/${conversationId}/end`, { method: "POST", retries: 3 });
    } catch (e) {
      // Ya terminada / inexistente = objetivo cumplido.
      if (e instanceof TavusApiError && e.status >= 400 && e.status < 500) return;
      throw e;
    }
  }

  async getConversation(conversationId: string, verbose = true) {
    try {
      const { data } = await call<TavusConversationDetail>(
        `/conversations/${conversationId}${verbose ? "?verbose=true" : ""}`,
        { retries: 2 },
      );
      return data;
    } catch (e) {
      if (e instanceof TavusApiError && e.status === 404) return null;
      throw e;
    }
  }

  async listConversations(opts: { status?: "active" | "ended"; limit?: number; page?: number }) {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    q.set("limit", String(opts.limit ?? 50));
    q.set("page", String(opts.page ?? 1));
    const { data } = await call<{ data?: TavusConversation[] }>(`/conversations?${q}`, { retries: 2 });
    return data?.data ?? [];
  }
}
