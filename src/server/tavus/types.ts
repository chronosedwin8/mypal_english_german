/** Tipos de la API de Tavus que usamos (subconjunto). */

export interface TavusConversationCreate {
  pal_id: string;
  face_id?: string;
  conversation_name: string;
  conversational_context?: string;
  custom_greeting?: string;
  callback_url?: string;
  participant_tags?: string[];
  require_auth?: boolean;
  max_participants?: number;
  test_mode?: boolean;
  properties: {
    max_call_duration: number;
    participant_absent_timeout: number;
    participant_left_timeout: number;
    enable_closed_captions?: boolean;
    enable_recording?: boolean;
    languages?: string[];
  };
}

export interface TavusConversation {
  conversation_id: string;
  conversation_name?: string;
  conversation_url: string;
  status: "active" | "ended" | string;
  created_at?: string;
  updated_at?: string;
  meeting_token?: string;
}

export interface TavusEventRecord {
  event_type: string;
  message_type?: string;
  timestamp?: string;
  properties?: Record<string, unknown>;
}

export interface TavusConversationDetail extends TavusConversation {
  events?: TavusEventRecord[];
}

export interface TavusPalRecord {
  pal_id: string;
  pal_name?: string;
  default_face_id?: string;
  system_prompt?: string;
  languages?: string[];
  layers?: Record<string, unknown>;
  guardrail_ids?: string[];
  tool_ids?: string[];
  skills?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TavusToolCreate {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  delivery: { app_message: true };
  trigger_type: "in_call";
  origin: "llm" | "vision";
  on_call: "silent" | "generate_filler" | null;
  on_resolve: "fire_and_forget";
}

export interface TavusClient {
  readonly driver: "http" | "fake";
  getPal(palId: string): Promise<TavusPalRecord | null>;
  createPal(spec: Record<string, unknown>): Promise<TavusPalRecord>;
  patchPal(palId: string, ops: { op: string; path: string; value?: unknown }[]): Promise<void>;
  listTools(): Promise<{ tool_id: string; name: string }[]>;
  createTool(tool: TavusToolCreate): Promise<{ tool_id: string; name: string }>;
  attachTools(palId: string, toolIds: string[]): Promise<void>;
  /** Adjunta una skill del PAL (p. ej. "memory" para recordar al alumno). */
  attachSkill(palId: string, skillId: string, config?: Record<string, unknown>): Promise<void>;
  createConversation(body: TavusConversationCreate): Promise<TavusConversation>;
  endConversation(conversationId: string): Promise<void>;
  getConversation(conversationId: string, verbose?: boolean): Promise<TavusConversationDetail | null>;
  listConversations(opts: { status?: "active" | "ended"; limit?: number; page?: number }): Promise<TavusConversation[]>;
}

/** Error con estado HTTP; `definite` = sabemos con certeza que NO se creo nada. */
export class TavusApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly definite: boolean,
  ) {
    super(message);
    this.name = "TavusApiError";
  }
}
