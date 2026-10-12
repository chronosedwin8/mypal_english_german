"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/auth-errors";

export function TwoFactorVerify() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const value = code.trim();
    // 6 digitos = app de autenticacion; otro formato = codigo de respaldo.
    const { error: err } = /^\d{6}$/.test(value)
      ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
      : await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust });
    setPending(false);
    if (err) return setError("El código no es válido. Inténtalo de nuevo.");
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input autoFocus inputMode="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label="Código" className="h-11 text-center font-mono text-lg tracking-widest" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="accent-primary" /> Confiar en este dispositivo por 30 días
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="h-11 w-full rounded-full" disabled={pending || code.trim().length < 6}>
        {pending && <Loader2Icon className="animate-spin" />} Verificar
      </Button>
    </form>
  );
}
