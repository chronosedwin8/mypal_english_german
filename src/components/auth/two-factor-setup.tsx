"use client";

import { Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

/**
 * Activar o desactivar el segundo factor (TOTP). Al activarlo se muestra el codigo QR
 * para la app de autenticacion y los codigos de respaldo, y se confirma con un codigo.
 */
export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "scan" | "done">(enabled ? "done" : "idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enable() {
    setError(null);
    setPending(true);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (err || !data || !("totpURI" in data)) return setError(err?.message ?? "No pudimos activar el segundo factor. Revisa tu contraseña.");
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setSecret(new URL(data.totpURI).searchParams.get("secret"));
    setBackup(data.backupCodes);
    setStep("scan");
  }

  async function verify() {
    setError(null);
    setPending(true);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setPending(false);
    if (err) return setError("El código no es válido. Usa el que muestra ahora tu app.");
    setStep("done");
    router.refresh();
  }

  async function disable() {
    setError(null);
    setPending(true);
    const { error: err } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (err) return setError(err.message ?? "No pudimos desactivarlo. Revisa tu contraseña.");
    setStep("idle");
    setPassword("");
    router.refresh();
  }

  if (step === "done")
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
          <ShieldCheckIcon className="size-5" /> Segundo factor activo
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="password" placeholder="Tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs" aria-label="Contraseña" />
          <Button type="button" variant="outline" onClick={disable} disabled={pending || !password}>
            Desactivar
          </Button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    );

  if (step === "scan")
    return (
      <div className="space-y-4">
        <p className="text-sm">1. Escanea este código con Google Authenticator, Microsoft Authenticator o 1Password.</p>
        {qr && (
          // QR generado en el navegador a partir del enlace otpauth.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Código QR para tu app de autenticación" width={220} height={220} className="rounded-xl border bg-white p-2" />
        )}
        {secret && (
          <p className="text-xs text-muted-foreground">
            ¿No puedes escanear? Escribe esta clave: <span className="font-mono">{secret}</span>
          </p>
        )}
        <div>
          <p className="text-sm">2. Guarda estos códigos de respaldo (cada uno sirve una vez si pierdes el teléfono):</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-3 font-mono text-sm sm:grid-cols-5">
            {backup.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input inputMode="numeric" autoComplete="one-time-code" placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[12rem]" aria-label="Código" />
          <Button type="button" onClick={verify} disabled={pending || code.trim().length < 6}>
            {pending && <Loader2Icon className="animate-spin" />} 3. Confirmar
          </Button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Al ingresar te pediremos, además de tu contraseña, un código de tu app de autenticación.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="password" placeholder="Tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs" aria-label="Contraseña" />
        <Button type="button" onClick={enable} disabled={pending || !password}>
          {pending && <Loader2Icon className="animate-spin" />} Activar segundo factor
        </Button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
