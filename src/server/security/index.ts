/**
 * Utilidades antiabuso: Turnstile del lado del servidor, IP del cliente y hashes
 * con pepper (nunca guardamos IPs ni identificadores de dispositivo en claro).
 */
import { createHmac } from "node:crypto";

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip");
}

/** Prefijo de red: /24 en IPv4 y /64 en IPv6 (los operadores moviles comparten IPs). */
export function ipPrefix(ip: string): string {
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":");
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : ip;
}

export function pepperedHash(value: string): string {
  const pepper = process.env.HASH_PEPPER;
  if (!pepper) throw new Error("Falta HASH_PEPPER en .env");
  return createHmac("sha256", pepper).update(value).digest("base64url");
}

export function ipPrefixHash(headers: Headers): string | null {
  const ip = clientIp(headers);
  return ip ? pepperedHash(`ip:${ipPrefix(ip)}`) : null;
}

/** Cookie anonima del test de nivel (se liga a la cuenta al registrarse). */
export const ANON_COOKIE = "mypal_anon";
export const DEVICE_COOKIE = "mypal_device";

export function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
