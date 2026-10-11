"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Turnstile } from "@/components/auth/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export default function ForgotPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!token) return setError("Completa la verificación de seguridad.");
    setPending(true);
    const { error: err } = await authClient.requestPasswordReset(
      { email, redirectTo: "/restablecer" },
      { headers: { "x-captcha-response": token } },
    );
    setPending(false);
    if (err && err.status === 429) return setError(authErrorMessage(err));
    // Siempre la misma respuesta: no revelamos si el correo existe.
    setSent(true);
  }

  return (
    <>
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Recupera tu contraseña</h1>
      {sent ? (
        <p className="mt-4 text-muted-foreground">
          Si existe una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo de tu cuenta</Label>
            <Input id="email" name="email" type="email" required className="h-11" />
          </div>
          <Turnstile onToken={onToken} action="password-reset" />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending} className="h-11 w-full rounded-full">
            Enviar enlace
          </Button>
        </form>
      )}
      <Link href="/ingresar" className="mt-6 block text-sm font-medium text-primary hover:underline">
        Volver a ingresar
      </Link>
    </>
  );
}
