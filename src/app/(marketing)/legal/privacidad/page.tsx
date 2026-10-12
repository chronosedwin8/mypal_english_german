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
      <p>
        Las cuentas son solo para mayores de 18 años. En el modo niños, el titular de la cuenta autoriza cada clase y está
        presente. En esas clases no pedimos ni guardamos el nombre ni otros datos personales del niño, no grabamos el video y
        la tutora está instruida para no solicitar información personal.
      </p>

      <h2>Instituciones y estudiantes de 15 a 17 años</h2>
      <p>
        Los colegios, universidades y empresas pueden inscribir a sus estudiantes en MyPAL. Los estudiantes de 15 a 17 años solo
        se registran a través de su institución, que declara tener la autorización previa, expresa e informada de sus
        representantes legales (Ley 1581 de 2012 y Decreto 1377 de 2013) y supervisa su uso en el aula. Sus datos se tratan
        solo en su interés superior: nunca para marketing ni para entrenar modelos de inteligencia artificial.
      </p>
      <p>
        La institución ve el avance, los resultados, los textos y las grabaciones de sus estudiantes. Las grabaciones de
        Speaking se guardan el tiempo que defina la institución y solo las ven el estudiante y sus docentes. Al retirarse de la
        institución, la cuenta y su historial siguen siendo del estudiante, y la institución deja de verlos. Al cumplir 18 años,
        la cuenta pasa a ser de adulto.
      </p>

      <h2>Exámenes con inteligencia artificial</h2>
      <p>
        Las preguntas de práctica se generan con inteligencia artificial y se revisan antes de publicarse. Los textos y las
        grabaciones que envías para calificar se procesan con proveedores de inteligencia artificial y de voz en niveles
        pagos que no usan tus datos para entrenar sus modelos. Las notas son estimaciones, no resultados oficiales.
      </p>

      <h2>Conservación</h2>
      <p>
        Conservamos tus datos mientras tengas una cuenta activa y el tiempo necesario para cumplir obligaciones legales y
        contables.
      </p>
    </article>
  );
}
