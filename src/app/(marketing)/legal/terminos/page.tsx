import type { Metadata } from "next";

import { PLANS, TOPUPS, TRIAL_SECONDS, formatUsd } from "@/lib/pricing/catalog";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Términos del servicio" };

export default function TermsPage() {
  return (
    <article className="prose-mypal mx-auto max-w-3xl px-4 py-16">
      <p className="rounded-xl bg-sun/30 px-4 py-3 text-sm">
        Borrador para revisión legal. Ajusta razón social, país y datos de contacto antes de publicar.
      </p>
      <h1>Términos del servicio</h1>
      <p>
        {SITE.name} ofrece práctica conversacional de inglés (americano y británico) y alemán con un tutor de inteligencia
        artificial por video. El tutor no es una persona y no reemplaza certificaciones oficiales de idiomas.
      </p>

      <h2>1. Cuenta</h2>
      <p>
        Debes ser mayor de 18 años y dar un correo válido. Eres responsable de tu contraseña y del uso de tu cuenta. Una
        persona puede tener una sola cuenta.
      </p>
      <p>
        <strong>Modo niños (Nuez):</strong> el titular de la cuenta puede usar sus minutos en clases para niños de 5 a 12
        años. Al iniciar cada clase declara ser su madre, padre o tutor legal, autoriza el uso de la cámara y se compromete a
        acompañar al niño durante toda la clase.
      </p>

      <h2>2. Prueba gratis</h2>
      <p>
        Cada persona puede usar una única clase gratis de {TRIAL_SECONDS / 60} minutos con el tutor, después de verificar su
        correo y completar el test de nivel. Podemos negar la prueba ante señales de cuentas o dispositivos repetidos.
      </p>

      <h2>3. Planes y minutos</h2>
      <ul>
        {PLANS.map((p) => (
          <li key={p.id}>
            Plan {p.nameEs}: {formatUsd(p.priceUsdCents)} al mes, {p.monthlySeconds / 60} minutos con el tutor, clases de hasta{" "}
            {p.perSessionCapSeconds / 60} minutos.
          </li>
        ))}
      </ul>
      <p>
        Los minutos del plan se renuevan con cada periodo mensual y <strong>no se acumulan</strong>. Las recargas (
        {TOPUPS.map((t) => `${t.seconds / 60} min por ${formatUsd(t.priceUsdCents)}`).join("; ")}) requieren un plan activo y
        vencen a los 90 días.
      </p>

      <h2>4. Cómo se cuentan los minutos</h2>
      <p>
        Se cuenta el tiempo de la videollamada con el tutor desde que se crea la conversación hasta que termina. El tiempo se
        redondea hacia arriba a múltiplos de 6 segundos y cada clase cuenta como mínimo 30 segundos. Si terminas antes del
        máximo, los minutos no usados vuelven a tu saldo. Si una clase falla por un problema técnico de nuestro lado, no se
        descuenta.
      </p>
      <p>
        Las clases se cierran automáticamente al llegar al máximo por clase o al agotarse tu saldo, si cierras la pestaña o si
        dejas de estar conectado.
      </p>

      <h2>5. Disponibilidad</h2>
      <p>
        El número de clases simultáneas es limitado. En horas de alta demanda puedes esperar en una fila; entrarás en orden de
        llegada. Podemos pausar el servicio por mantenimiento o seguridad.
      </p>

      <h2>6. Cancelación y reembolsos</h2>
      <p>
        Puedes cancelar la renovación en cualquier momento desde “Planes”; conservas tus minutos hasta el fin del periodo
        pagado. Si se aprueba un reembolso, se retiran los minutos no usados de esa compra.
      </p>

      <h2>7. Uso aceptable</h2>
      <p>
        No uses el servicio para contenido ilegal, ofensivo o sexual, ni intentes manipular al tutor, revender el acceso o
        compartir el enlace de tus clases. Podemos suspender cuentas que incumplan estas reglas.
      </p>

      <h2>8. Contacto</h2>
      <p>Escríbenos a {SITE.supportEmail}.</p>
    </article>
  );
}
