import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Crea una nueva contraseña</h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
