import { Suspense } from "react";

import { TwoFactorVerify } from "./verify";

export const metadata = { title: "Código de verificación" };

export default function TwoFactorPage() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Código de verificación</h1>
        <p className="mt-1 text-muted-foreground">Escribe el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de respaldo.</p>
      </div>
      <Suspense fallback={null}>
        <TwoFactorVerify />
      </Suspense>
    </div>
  );
}
