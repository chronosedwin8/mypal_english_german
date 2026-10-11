/**
 * Envio de correos.
 *
 * En desarrollo NO se envia nada: el correo se imprime en consola y se guarda en
 * `.dev-mail/outbox.json`, que se puede ver en http://localhost:3000/dev/correo
 * (verificacion de cuenta, recuperacion de contraseña...).
 *
 * En produccion se conectara un proveedor (Resend, SES, SMTP). Mientras no exista,
 * se registra un error visible para no fallar en silencio.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Enlace principal del correo (para el buzon de desarrollo). */
  actionUrl?: string;
  kind: "verify-email" | "reset-password" | "notice";
}

export interface StoredEmail extends OutgoingEmail {
  id: string;
  createdAt: string;
}

const OUTBOX_DIR = path.join(process.cwd(), ".dev-mail");
const OUTBOX_FILE = path.join(OUTBOX_DIR, "outbox.json");
const MAX_STORED = 50;

export async function readDevOutbox(): Promise<StoredEmail[]> {
  try {
    return JSON.parse(await readFile(OUTBOX_FILE, "utf8")) as StoredEmail[];
  } catch {
    return [];
  }
}

async function storeDevEmail(email: OutgoingEmail) {
  await mkdir(OUTBOX_DIR, { recursive: true });
  const current = await readDevOutbox();
  const stored: StoredEmail = {
    ...email,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await writeFile(OUTBOX_FILE, JSON.stringify([stored, ...current].slice(0, MAX_STORED), null, 2));
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    await storeDevEmail(email);
    console.log(
      `\n📧 [correo de desarrollo] para ${email.to}: ${email.subject}` +
        (email.actionUrl ? `\n   ${email.actionUrl}` : "") +
        `\n   (ver todos en ${process.env.APP_URL ?? "http://localhost:3000"}/dev/correo)\n`,
    );
    return;
  }
  // TODO(produccion): conectar proveedor de correo.
  console.error(`[email] Sin proveedor configurado: no se envio "${email.subject}" a ${email.to}`);
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${cta.label}</a></p>
       <p style="color:#6b7280;font-size:13px">Si el botón no funciona, copia este enlace:<br>${cta.url}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,sans-serif;background:#f6f5ff;padding:24px">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:32px">
    <p style="font-size:22px;font-weight:800;color:#6d28d9;margin:0 0 16px">MyPAL</p>
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    <div style="color:#374151;line-height:1.6">${body}</div>${button}
  </div></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): OutgoingEmail {
  return {
    to,
    kind: "verify-email",
    subject: "Confirma tu correo en MyPAL",
    actionUrl: url,
    text: `Hola ${name}, confirma tu correo para activar tu cuenta: ${url}`,
    html: layout(
      `¡Hola, ${name}!`,
      "Confirma tu correo para activar tu cuenta y reclamar tu clase gratis de 5 minutos con tu tutor.",
      { label: "Confirmar mi correo", url },
    ),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): OutgoingEmail {
  return {
    to,
    kind: "reset-password",
    subject: "Restablece tu contraseña de MyPAL",
    actionUrl: url,
    text: `Hola ${name}, usa este enlace para crear una nueva contraseña: ${url}`,
    html: layout(
      "Restablecer contraseña",
      "Recibimos una solicitud para cambiar tu contraseña. Si no fuiste tú, ignora este correo.",
      { label: "Crear nueva contraseña", url },
    ),
  };
}
