"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResendVerification() {
  const email = useSearchParams().get("email") ?? "";
  const [pending, setPending] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  async function resend() {
    if (!email) return;
    setPending(true);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/app" });
    setPending(false);
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Listo, te enviamos un nuevo enlace.");
  }

  return (
    <div className="mt-8 space-y-4">
      {email && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">
          Enviado a <strong>{email}</strong>
        </p>
      )}
      {email && (
        <Button variant="outline" onClick={resend} disabled={pending} className="h-11 w-full rounded-full">
          Reenviar enlace
        </Button>
      )}
      {isDev && (
        <p className="text-sm text-muted-foreground">
          Modo desarrollo: los correos no salen de tu equipo.{" "}
          <Link href="/dev/correo" className="font-semibold text-primary hover:underline">
            Abrir buzón de prueba
          </Link>
        </p>
      )}
      <Link href="/ingresar" className="block text-sm font-medium text-primary hover:underline">
        Volver a ingresar
      </Link>
    </div>
  );
}
