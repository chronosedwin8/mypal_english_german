import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/server/auth/auth";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    twoFactorClient({
      // Con segundo factor activo, el ingreso pide el codigo de la app de autenticacion.
      onTwoFactorRedirect() {
        const next = new URLSearchParams(window.location.search).get("next") ?? "/app";
        window.location.assign(new URL(`/ingresar/2fa?next=${encodeURIComponent(next)}`, window.location.origin));
      },
    }),
  ],
});
