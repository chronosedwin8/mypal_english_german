"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const linkError = params.get("error");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token || linkError) {
    return (
      <div className="mt-6 space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{authErrorMessage({ code: "INVALID_TOKEN" })}</AlertDescription>
        </Alert>
        <Link href="/recuperar" className="text-sm font-semibold text-primary hover:underline">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (newPassword !== confirm) return setError("Las contraseñas no coinciden.");
    setPending(true);
    const { error: err } = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (err) return setError(authErrorMessage(err));
    router.push("/ingresar?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Repítela</Label>
        <Input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" className="h-11" />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-full">
        Guardar contraseña
      </Button>
    </form>
  );
}
