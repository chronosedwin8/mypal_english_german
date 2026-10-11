"use client";

import DailyIframe, { type DailyCall, type DailyEventObjectAppMessage, type DailyEventObjectTrack } from "@daily-co/daily-js";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CallControls, CallOptions, CallState, Caption } from "./types";

/**
 * Llamada real con Tavus (Daily por debajo). Escucha los eventos del protocolo
 * de interacciones de Tavus: subtitulos, quien habla y herramientas del tutor.
 */
export function useDailyCall(opts: CallOptions): CallState & CallControls {
  const callRef = useRef<DailyCall | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const captionId = useRef(0);
  const [state, setState] = useState<CallState>({
    status: "idle",
    error: null,
    tutorVideo: null,
    tutorAudio: null,
    localVideo: null,
    tutorSpeaking: false,
    captions: [],
    micOn: true,
    camOn: true,
    sharing: false,
  });

  const pushCaption = (role: Caption["role"], text: string) => {
    if (!text.trim()) return;
    setState((s) => ({
      ...s,
      captions: [...s.captions, { id: ++captionId.current, role, text: text.trim() }].slice(-6),
    }));
  };

  const join = useCallback(async () => {
    const { conversationUrl, meetingToken, userName } = optsRef.current;
    if (!conversationUrl || callRef.current) return;
    const call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
    callRef.current = call;
    setState((s) => ({ ...s, status: "joining", error: null }));

    call.on("joined-meeting", () => {
      setState((s) => ({ ...s, status: "joined" }));
      optsRef.current.onJoined();
    });
    call.on("left-meeting", () => {
      setState((s) => ({ ...s, status: "left" }));
      optsRef.current.onLeft();
    });
    call.on("error", (e) => {
      setState((s) => ({ ...s, status: "error", error: e?.errorMsg ?? "Se perdió la conexión con tu tutor." }));
    });
    call.on("track-started", (e?: DailyEventObjectTrack) => {
      if (!e?.track) return;
      const stream = new MediaStream([e.track]);
      if (e.participant?.local) {
        if (e.type === "video") setState((s) => ({ ...s, localVideo: stream }));
      } else if (e.type === "video") {
        setState((s) => ({ ...s, tutorVideo: stream }));
      } else if (e.type === "audio") {
        setState((s) => ({ ...s, tutorAudio: stream }));
      }
    });
    call.on("participant-left", (e) => {
      // Si el tutor sale, la clase termino.
      if (e && !e.participant.local) void call.leave();
    });
    call.on("app-message", (e?: DailyEventObjectAppMessage) => {
      const msg = e?.data as { event_type?: string; properties?: Record<string, unknown> } | undefined;
      if (!msg?.event_type) return;
      const p = msg.properties ?? {};
      const role = p.role === "user" ? "student" : "tutor";
      switch (msg.event_type) {
        case "conversation.utterance":
          pushCaption(role, String(p.speech ?? p.text ?? ""));
          break;
        case "conversation.started_speaking":
          if (role === "tutor") setState((s) => ({ ...s, tutorSpeaking: true }));
          break;
        case "conversation.stopped_speaking":
          if (role === "tutor") setState((s) => ({ ...s, tutorSpeaking: false }));
          break;
        case "conversation.tool_call": {
          const fn = (p.function ?? {}) as { name?: string; arguments?: unknown };
          const name = String(p.name ?? fn.name ?? "");
          const raw = p.arguments ?? fn.arguments ?? {};
          let args: Record<string, unknown> = {};
          try {
            args = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
          } catch {
            args = {};
          }
          if (name) optsRef.current.onToolCall({ name, arguments: args });
          break;
        }
      }
    });

    try {
      await call.join({ url: conversationUrl, token: meetingToken ?? undefined, userName });
    } catch {
      setState((s) => ({ ...s, status: "error", error: "No pudimos entrar a la llamada. Revisa tu conexión." }));
    }
  }, []);

  const leave = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    try {
      await call.leave();
    } finally {
      await call.destroy().catch(() => undefined);
      callRef.current = null;
    }
  }, []);

  const send = (event_type: string, properties: Record<string, unknown>) => {
    const call = callRef.current;
    const conversation_id = optsRef.current.conversationId;
    if (!call || !conversation_id) return;
    call.sendAppMessage({ message_type: "conversation", event_type, conversation_id, properties }, "*");
  };

  useEffect(() => () => void leave(), [leave]);

  return {
    ...state,
    join,
    leave,
    toggleMic: () => {
      const call = callRef.current;
      if (!call) return;
      const next = !state.micOn;
      call.setLocalAudio(next);
      setState((s) => ({ ...s, micOn: next }));
    },
    toggleCam: () => {
      const call = callRef.current;
      if (!call) return;
      const next = !state.camOn;
      call.setLocalVideo(next);
      setState((s) => ({ ...s, camOn: next }));
    },
    toggleScreenShare: () => {
      const call = callRef.current;
      if (!call) return;
      if (state.sharing) call.stopScreenShare();
      else call.startScreenShare();
      setState((s) => ({ ...s, sharing: !s.sharing }));
    },
    say: (text: string) => send("conversation.respond", { text }),
  };
}
