import type { Metadata } from "next";

import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <article className="prose-mypal mx-auto max-w-3xl px-4 py-16">
      <p className="rounded-xl bg-sun/30 px-4 py-3 text-sm">
        Borrador para revisión legal (incluye referencias a la Ley 1581 de 2012 de Colombia sobre protección de datos).
        Ajusta el responsable del tratamiento y los datos de contacto antes de publicar.
      </p>
      <h1>Política de privacidad</h1>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> nombre, correo y contraseña (guardada cifrada).</li>
        <li><strong>Aprendizaje:</strong> respuestas del test de nivel, nivel estimado, vocabulario, correcciones y transcripciones de tus clases.</li>
        <li>
          <strong>Voz en el test de nivel:</strong> tus dos grabaciones cortas se envían a ElevenLabs para transcribirlas.
          Guardamos el texto transcrito y la puntuación, no el audio.
        </li>
        <li>
          <strong>Video en las clases:</strong> tu cámara y micrófono se transmiten en tiempo real a Tavus para que el tutor
          pueda verte y escucharte. Las clases no se graban. El tutor puede recordar temas de clases anteriores para
          personalizar tu práctica.
        </li>
        <li><strong>Pagos:</strong> los procesa la pasarela de pagos; no guardamos números de tarjeta.</li>
        <li>
          <strong>Seguridad:</strong> guardamos huellas cifradas (no reversibles) de tu red y dispositivo para evitar el abuso de
          la prueba gratis, y usamos Cloudflare Turnstile para detectar bots.
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <p>
        Para darte el servicio, adaptar las clases a tu nivel, medir y cobrar el tiempo de uso, prevenir fraude y mejorar el
        producto. No vendemos tus datos.
      </p>

      <h2>Proveedores</h2>
      <p>
        Tavus (video conversacional con IA), ElevenLabs (voz y transcripción), Cloudflare (seguridad) y la pasarela de pagos.
        Pueden procesar datos fuera de tu país con medidas de protección adecuadas.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes conocer, actualizar, rectificar y solicitar la eliminación de tus datos, y revocar tu autorización, escribiendo a{" "}
        {SITE.supportEmail}. Responderemos en los plazos que establece la ley aplicable.
      </p>

      <h2>Menores de edad</h2>
      <p>El servicio es solo para mayores de 18 años.</p>

      <h2>Conservación</h2>
      <p>
        Conservamos tus datos mientras tengas una cuenta activa y el tiempo necesario para cumplir obligaciones legales y
        contables.
      </p>
    </article>
  );
}
