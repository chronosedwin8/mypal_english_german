/**
 * Correo normalizado para detectar cuentas repetidas (antiabuso de la prueba gratis):
 *  - minusculas y sin espacios,
 *  - sin "+etiqueta" en la parte local,
 *  - en Gmail, sin puntos (a.b@gmail.com == ab@gmail.com) y googlemail -> gmail.
 */
export function canonicalEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}
