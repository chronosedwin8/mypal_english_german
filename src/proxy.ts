import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Redireccion de conveniencia: sin cookie de sesion, /app y /admin llevan a
 * /ingresar. NO es la verificacion de seguridad: cada pagina y ruta API valida
 * la sesion en el servidor (src/server/auth/dal.ts).
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/ingresar", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/docente/:path*", "/institucion/:path*"],
};
