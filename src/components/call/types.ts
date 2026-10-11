export type CallStatus = "idle" | "joining" | "joined" | "left" | "error";

export interface Caption {
  id: number;
  role: "tutor" | "student";
  text: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CallState {
  status: CallStatus;
  error: string | null;
  tutorVideo: MediaStream | null;
  tutorAudio: MediaStream | null;
  localVideo: MediaStream | null;
  tutorSpeaking: boolean;
  captions: Caption[];
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
}

export interface CallControls {
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => void;
  /** El tutor responde como si el alumno hubiera dicho este texto. */
  say: (text: string) => void;
}

export interface CallOptions {
  conversationId: string | null;
  conversationUrl: string | null;
  meetingToken: string | null;
  userName: string;
  onJoined: () => void;
  onLeft: () => void;
  onToolCall: (call: ToolCall) => void;
}
