"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Turnstile } from "@/components/auth/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";
import { planById } from "@/lib/pricing/catalog";

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = planById(params.get("plan") ?? "");
  // Invitacion de una institucion: vuelve a /unirse/<codigo> despues de verificar el correo.
  const next = params.get("next");
  const viaInvitation = next ? safeNext(next).startsWith("/unirse/") : false;
  const [token, setToken] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!accepted)
      return setError(viaInvitation ? "Debes aceptar los términos para unirte a tu institución." : "Debes aceptar los términos y confirmar que eres mayor de edad.");
    if (!token) return setError("Completa la verificación de seguridad.");
    setPending(true);
    const callbackURL = viaInvitation ? safeNext(next) : plan ? `/app/planes?plan=${plan.id}` : "/app";
    const { error: err } = await authClient.signUp.email(
      { name, email, password, callbackURL },
      { headers: { "x-captcha-response": token } },
    );
    setPending(false);
    if (err) return setError(authErrorMessage(err));
    router.push(`/verifica-tu-correo?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      {plan && (
        <Alert>
          <AlertDescription>
            Elegiste el plan <strong>{plan.nameEs}</strong>. Primero crea tu cuenta y prueba gratis a tu tutor.
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">¿Cómo te llamas?</Label>
        <Input id="name" name="name" autoComplete="given-name" required maxLength={60} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(Boolean(v))} className="mt-0.5" />
        <span>
          {viaInvitation ? "Me uno por invitación de mi institución y acepto los" : "Soy mayor de 18 años y acepto los"}{" "}
          <Link href="/legal/terminos" className="font-medium text-primary underline-offset-4 hover:underline">
            términos
          </Link>{" "}
          y la{" "}
          <Link href="/legal/privacidad" className="font-medium text-primary underline-offset-4 hover:underline">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      <Turnstile onToken={onToken} action="sign-up" />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-full text-base">
        {pending && <Loader2Icon className="animate-spin" />} Crear cuenta
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href={viaInvitation ? `/ingresar?next=${encodeURIComponent(safeNext(next))}` : "/ingresar"} className="font-semibold text-primary hover:underline">
          Ingresa
        </Link>
      </p>
    </form>
  );
}
