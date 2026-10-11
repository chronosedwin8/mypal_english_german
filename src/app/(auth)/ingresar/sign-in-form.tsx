"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const notice = params.get("reset") ? "Tu contraseña se actualizó. Ya puedes ingresar." : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setPending(true);
    const { error: err } = await authClient.signIn.email({ email, password, callbackURL: next });
    setPending(false);
    if (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        router.push(`/verifica-tu-correo?email=${encodeURIComponent(email)}`);
        return;
      }
      return setError(authErrorMessage(err));
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Contraseña</Label>
          <Link href="/recuperar" className="text-sm font-medium text-primary hover:underline">
            ¿La olvidaste?
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-full text-base">
        {pending && <Loader2Icon className="animate-spin" />} Ingresar
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Primera vez?{" "}
        <Link href="/registro" className="font-semibold text-primary hover:underline">
          Crea tu cuenta gratis
        </Link>
      </p>
    </form>
  );
}
