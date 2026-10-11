/** Dominios de correo temporal mas comunes (lista corta; ampliable). */
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "sharklasers.com",
  "fakeinbox.com",
  "mintemail.com",
  "emailondeck.com",
  "mohmal.com",
  "tempail.com",
  "moakt.com",
]);

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE.has(domain.toLowerCase());
}
