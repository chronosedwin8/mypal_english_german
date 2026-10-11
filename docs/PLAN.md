# Plan: MyPAL — Tutor conversacional de idiomas con avatar IA (Tavus CVI)

> Proyecto nuevo en `C:\Users\eortiz\Desktop\MyPAL` (hoy la carpeta está vacía). Al aprobarlo, este plan también se guardará como `docs/PLAN.md` dentro del proyecto.

## Contexto

Quieres una aplicación web interactiva para aprender **inglés (americano y británico) y alemán** a nivel conversacional, hablando por video con un **tutor-avatar de Tavus** que además **ve el entorno del estudiante** (visión por computador, modelo `raven-1`). Así el alumno puede mostrar objetos y preguntar por ellos.

Tavus cobra cada minuto de video desde que se crea la conversación. Por eso el negocio solo funciona si **cada minuto vendido está controlado** y cada plan garantiza **≥ 60 % de margen bruto sobre el precio de venta**, incluso si el usuario consume el 100 % de sus minutos.

**Decisiones ya tomadas**
- **Margen:** 60 % **sobre el precio** (precio ≥ 2,5 × costo variable), confirmado por ti.
- **Pagos:** **simulados** en esta versión, detrás de una interfaz intercambiable (Stripe, Mercado Pago o Wompi se conectan después sin reescribir nada).
- **Base de datos:** PostgreSQL 17 local (el servicio `postgresql-x64-17` está corriendo), usuario `postgres`, base nueva `mypal`.
- **Avatar:** `p3a4e97dc806` es un **PAL** (persona) de Tavus; los IDs de cara empiezan por `r`. Lo usamos como base y **no lo modificamos**.

---

## 1. Modelo de precios (el punto más delicado)

### 1.1 Costos reales de Tavus (página de precios actual, oct-2026)

| Plan Tavus | Mensual | Minutos incluidos | Minuto extra | Sesiones simultáneas | Máx. por conversación |
|---|---|---|---|---|---|
| Starter (solo desarrollo) | $22 | 60 | sin minutos extra (se corta) | 1 | 10 min |
| **Builder (lanzamiento)** | $59 | 175 | **$0,35** | 3 | 15 min |
| Growth | $397 | 1.300 | $0,31 | 10 | 60 min |
| Business | $975 | 4.000 | $0,26 | 15 | 60 min |

Reglas de facturación de Tavus que condicionan el diseño:
- El cobro empieza **cuando se crea la conversación**, no cuando el usuario entra. Se redondea a 6 s y hay un **mínimo de 30 s** por conversación.
- Se cobra aunque nadie entre. Tavus la cierra a los 5 min por defecto; nosotros la cerraremos a los 45 s.
- `test_mode: true` crea conversaciones **sin costo**. Lo usamos en desarrollo y en las pruebas automáticas.
- Tu propuesta usaba precios antiguos (Starter $59 / 100 min / $0,32). Hoy el plan de $59 es Builder: 175 min y $0,35 por minuto extra.

### 1.2 Supuestos del cálculo (peor caso)
- **Costo por minuto de avatar: $0,37.** Es el minuto extra de Builder ($0,35) más un 5 % de colchón por redondeos, mínimos de 30 s y segundos de conexión.
- **Comisión de la pasarela: 6 % + $0,30 por cobro.** Es conservador para tarjetas en LatAm; hoy es simulado, pero ya queda descontado.
- **Costo de plataforma: $0,50 por usuario al mes** (hosting, correo, base de datos).
- **Fórmula:** margen = (precio − comisión − minutos × 0,37 − 0,50) / precio, **suponiendo que el usuario gasta el 100 % de sus minutos**.

### 1.3 Planes propuestos (USD/mes)

| Plan | Precio | Minutos con avatar | Equivale a | Costo máx. Tavus | Margen mínimo garantizado |
|---|---|---|---|---|---|
| **Básico** | **$25** | 20 min | ≈ 2 clases de 10 min | $7,40 | **61,2 %** |
| **Fluido** ★ más popular | **$69** | 60 min | ≈ 4 clases de 15 min | $22,20 | **60,7 %** |
| **Inmersión** | **$135** | 120 min | ≈ 8 clases de 15 min | $44,40 | **60,5 %** |

Todos los planes incluyen:
- los 3 tutores (EE. UU., Reino Unido, Alemania), con visión;
- módulos temáticos por nivel;
- transcripción y resumen de cada clase;
- “Mi vocabulario” con repaso espaciado (costo $0);
- progreso por nivel MCER (A1–C1).

Cada clase dura como máximo **10 min en Básico** y **15 min en Fluido e Inmersión** (el tope del plan Builder). Los minutos **no se acumulan** de un mes a otro.

**Recargas** (solo con suscripción activa, válidas 90 días):

| Recarga | Precio | $/min | Margen mínimo |
|---|---|---|---|
| 15 min | $19 | 1,27 | 63,2 % |
| 30 min | $36 | 1,20 | 62,3 % |

Las recargas cuestan un poco más por minuto que los planes, para empujar al usuario a subir de plan.

**Por qué no funciona “$49 con 100 min”:** 100 min cuestan $37 más comisiones, así que el margen es de **≈ 17 %** si el usuario los usa todos. Para mantener el 60 % a $49 solo caben **~42 min**.

**Sin descuento anual en v1:** “2 meses gratis” dejaría el plan Fluido en ~54 % de margen. Se puede activar al pasar a Tavus Growth (ver 1.5).

### 1.4 Embudo gratuito (costo controlado)
1. **Test diagnóstico gratis, sin avatar y sin registro, con voces de ElevenLabs (≈ $0 por usuario).** Es un test adaptativo de 12 a 25 preguntas de gramática, vocabulario, lectura, escucha y habla. El resultado es tu nivel MCER, que se guarda al crear la cuenta. Sirve como imán de clientes.
   - **Escucha:** audios con voces nativas de ElevenLabs (americana, británica y alemana). **Se generan una sola vez** con un script y se sirven como archivos estáticos (MP3), así que no hay costo por usuario. Si falta algún audio, se usa la voz del navegador como respaldo.
   - **Habla (2 ejercicios cortos):**
     - leer en voz alta una frase: se transcribe con ElevenLabs Speech-to-Text (Scribe v2) y se compara con la frase original (precisión de palabras y confianza);
     - responder una pregunta abierta en ≤ 20 s: se miden fluidez y variedad de vocabulario.
     - Costo: Scribe cobra $0,22 por hora de audio, unos **$0,002 por test**.
   - **Antiabuso, porque es sin registro:**
     - Turnstile al empezar el test;
     - como máximo 2 grabaciones de ≤ 20 s por intento;
     - límite de intentos por IP;
     - la clave de ElevenLabs solo vive en el servidor.
   - Si la grabación falla, el test sigue sin la parte de habla.
2. **Prueba con el avatar: 5 min completos, una sola vez.** Cuesta ≈ $1,85 por usuario y se puede ajustar desde el admin.
   - Requisitos: correo verificado, diagnóstico completado y Cloudflare Turnstile.
   - Una prueba por cuenta, por correo normalizado y por dispositivo; como máximo unas pocas por red IP en 30 días.
   - Se bloquean los correos desechables.
   - **Tope diario de pruebas:** por defecto 100 min/día (20 pruebas), ≈ $37/día como máximo. Es configurable.
3. **Paywall obligatorio.** Tavus corta la clase a los 5 min (`max_call_duration`). El cubo de prueba es de 320 s, para que los 20 s de seguridad no le resten tiempo al usuario. A los 4:30 el tutor se despide e invita a suscribirse, y luego aparecen los planes.

### 1.5 Cuándo subir de plan en Tavus (los márgenes mejoran)

| Cambio | Cuándo | Margen de los planes |
|---|---|---|
| Builder → Growth | Más de **~1.140 min/mes** reales (≈ 19 usuarios Fluido al 100 %), o cola frecuente por el límite de 3 clases simultáneas | sube a **~64,5 %** |
| Growth → Business | Más de **~3.200 min/mes** | sube a **~69 %** |

El costo fijo de Builder ($59/mes) se cubre con un solo suscriptor Fluido. El panel admin muestra esta recomendación automáticamente.

### 1.6 Protecciones del margen (todas en el software)
- **Tope duro:** sin saldo no se puede iniciar clase. Cada conversación se crea con `max_call_duration` = mínimo entre (saldo, tope por clase del plan, tope del plan Tavus) **menos 20 s de seguridad**. Así **Tavus mismo la corta**, y lo cobrado nunca supera lo reservado.
- **Reserva previa:**
  - Al crear la clase se “retienen” los segundos permitidos.
  - Al terminar se cobra lo real: redondeo hacia arriba a 6 s, mínimo 30 s, igual que Tavus o más.
  - El resto se devuelve.
- **Sala privada:** `require_auth` + `max_participants: 2`. El enlace de la clase no se puede compartir para que otros usen minutos gratis.
- La conversación **solo se crea** después de que el usuario da permiso de cámara y micrófono y pulsa “Empezar”. Además: `participant_absent_timeout` 45 s y `participant_left_timeout` 15 s.
- **Tres vigilantes independientes:**
  1. el tope de Tavus;
  2. un *worker* que cierra por API toda clase pasada de tiempo o sin latido del navegador;
  3. un **“cazador de huérfanas”** que cierra cualquier conversación de Tavus nuestra que no esté ligada a una clase activa.
- **Una clase activa por usuario**, y un **límite global** igual a las clases simultáneas del plan Tavus (3), con **cola** y tiempo estimado de espera.
- **Interruptor de emergencia y presupuesto mensual de minutos Tavus** desde el admin.
- **Panel de margen:** margen real, margen “peor caso” (cuenta todos los minutos vendidos aún sin usar) y margen con el fijo de Tavus incluido.

---

## 2. Producto y experiencia

### 2.1 Landing page (ilustrativa y llamativa)
- **Hero:** maqueta animada de una videollamada con el tutor.
  - El estudiante levanta una taza y aparece una burbuja de visión: “I can see a mug! ☕ — How would you describe it?”.
  - Selector de idioma con banderas 🇺🇸 🇬🇧 🇩🇪.
  - Botón principal: “Haz tu test de nivel gratis”.
- **Cómo funciona**, en 3 pasos: test gratis → 3 min con tu tutor → eliges plan.
- **“Tu tutor ve tu mundo”:** muestra objetos, describe tu cuarto, comparte tu pantalla.
- **Inglés americano vs. británico vs. alemán:** tarjetas con ejemplos (“elevator / lift”, “der Tisch”).
- **Módulos temáticos** en carrusel: viajes, restaurante, entrevista de trabajo, tu casa, compras, salud, reuniones.
- **Precios (simple):**
  - 3 tarjetas con precio, minutos, “≈ N clases”, 3–4 viñetas y botón.
  - Debajo, una sola línea: “¿Necesitas más? Recargas desde $19”.
  - Sin tablas largas.
- **Preguntas frecuentes (cortas):** cómo se cuentan los minutos, cancelación, idiomas, privacidad de la cámara.
- **Diseño:** Tailwind + Motion, ilustraciones SVG propias, modo claro/oscuro, adaptable a móvil.

### 2.2 Aplicación del estudiante
- **Onboarding:** idioma y variante (US/UK/DE) → test diagnóstico → nivel.
- **Dashboard:** minutos restantes (barra), racha, nivel, módulo sugerido, botón “Practicar ahora”.
- **Sala de clase:** UI propia con Daily JS.
  - **Antes de entrar:** revisión de cámara, micrófono y navegador, y consentimiento de visión.
  - **En pantalla:** video del tutor y tu cámara, cuenta regresiva y subtítulos en vivo.
  - **Botones rápidos al tutor:** “Más despacio”, “Repite”, “Corrígeme más”, “¿Cómo se dice…?”.
  - **Modo “¿Qué es esto?”:** muestras un objeto y el tutor lo nombra (en alemán con su artículo der/die/das), lo deletrea y lo usa en frases.
  - **Compartir pantalla:** el tutor también la ve.
  - **Cierre:** a 1 min del final el tutor resume y se despide; la clase se cierra limpia al agotarse el tiempo.
- **Después de cada clase:**
  - transcripción y resumen;
  - correcciones;
  - palabras nuevas en “Mi vocabulario”, que el tutor guarda con una herramienta propia, sin costo extra de IA.
- **Módulos por nivel** (A1–C1, inglés y alemán): cada módulo trae objetivos, vocabulario clave, frases y las instrucciones que recibe el tutor. Algunos incluyen actividades con visión.
- **Memoria del tutor:** recuerda al alumno entre clases (`participant_tags` por usuario y variante).
- **Facturación (simulada):** elegir plan, recargar, cancelar e historial.

### 2.3 Panel de administración
- Ingresos, costo Tavus, costo de las pruebas y los tres márgenes.
- Clases en vivo, con botón para forzar el cierre; cola y cupos.
- Usuarios y su historial de minutos (ledger); conceder minutos, con auditoría.
- Configuración: minutos de prueba, concurrencia, costo/min, presupuesto e interruptor.
- Editor de planes que **rechaza cualquier precio con menos del 60 % de margen**.
- Recomendación de cambio de plan Tavus; registro de auditoría.

---

## 3. Arquitectura técnica

### 3.1 Stack
| Componente | Elección |
|---|---|
| Framework | **Next.js 16** (App Router, TypeScript, React 19): frontend y API en un solo proyecto, con `pnpm` |
| Interfaz | **Tailwind CSS v4 + shadcn/ui + Motion + lucide-react** |
| Datos | **Prisma 7 + PostgreSQL 17**: `DATABASE_URL=postgresql://postgres:<tu-contraseña>@localhost:5432/mypal`, más `mypal_test` para pruebas. Un script crea las bases si no existen (`psql` no está en el PATH) |
| Autenticación | **Better Auth**: correo + contraseña, verificación de correo, recuperación, límite de intentos y Turnstile integrados. Auth.js v5 nunca salió de beta y el proyecto pasó a Better Auth. En local, los correos se imprimen en consola |
| Validación | **Zod** en todo lo que entra |
| Video | **@daily-co/daily-js** (Tavus usa Daily por debajo) |
| Voz del diagnóstico | **ElevenLabs**: texto a voz (generado una sola vez) y voz a texto con Scribe v2. Se reutiliza el patrón de cliente de `codenestschool/scripts/lib/elevenlabs.ts`: reintentos con retroceso, y la clave nunca se imprime. La clave se copia de `codenestschool/.env` a `MyPAL/.env.local` sin mostrarla |
| Worker | **pg-boss**, cola de trabajos dentro del mismo Postgres (sin Redis). Se ejecuta con `pnpm worker` |
| Pruebas | **Vitest** (unitarias e integración) + **fast-check** (pruebas de propiedades del ledger) + **Playwright** (e2e) |

Los precios y la fórmula de margen viven en **un solo módulo puro** (`src/server/pricing/margin.ts`), que usan la landing, el admin, el seed y los tests.

### 3.2 Estructura del proyecto
```
MyPAL/
  docs/PLAN.md
  prisma/   schema.prisma · migrations/ (con SQL manual: CHECKs e índices parciales) · seed/ (planes, recargas, config, módulos y banco diagnóstico EN/DE)
  scripts/  db-create.ts · tavus-setup.ts · tavus-smoke.ts · check-pricing.ts
  worker/   index.ts · jobs/ (deadline, sweep, poll, orphan-killer, queue, expire, invariants, transcripts)
  src/app/(marketing)/   landing, prueba-de-nivel, legal
  src/app/(auth)/        login, signup, verify-email, reset
  src/app/(app)/         dashboard, diagnostic, practice/[language], session/[id] (+summary), vocabulary, billing
  src/app/admin/         resumen/margen, en vivo, sesiones, usuarios, planes, config, contenido, tavus, auditoría
  src/app/api/           sessions (+joined/heartbeat/end), queue, tavus/webhook/[token], payments/[provider]/webhook, diagnostic
  src/server/            ledger/ · metering/ · sessions/ · tavus/ (cliente real + falso, prompts, pal-spec) · payments/ (interfaz + simulado) · pricing/ · diagnostic/ · trial/ · config/
  src/components/        marketing/ · call/ · diagnostic/ · admin/ · ui/
  tests/                 unit/ · integration/ · e2e/ · fixtures/
  .env.local (fuera de git) · .env.example
```

### 3.3 Modelo de datos
| Área | Tablas |
|---|---|
| Usuarios | `User` (rol, correo normalizado), `LanguageProfile` (variante, nivel MCER, etiqueta de memoria Tavus) |
| Comercio | `Plan`, `TopupPack`, `Subscription`, `Payment`, `ProcessedWebhookEvent` |
| Minutos (en segundos enteros) | `MinuteWallet` (una fila por usuario; es el candado `FOR UPDATE`), `MinuteBucket` (PRUEBA / PLAN / RECARGA / ADMIN, con vencimiento), `SessionHold` (qué cubo financia cada clase), `LedgerEntry` (**solo se agregan filas**, con clave de idempotencia única) |
| Clases | `TutorSession` (estados RESERVED → CREATING → READY → LIVE → ENDING → ENDED → SETTLED, o FAILED), `ConcurrencySlot`, `SessionQueueEntry`, `TavusEvent`, `Transcript`, `SessionReport` |
| Aprendizaje | `VocabularyItem` (con repaso espaciado), `DiagnosticItem` / `DiagnosticAttempt` / `DiagnosticResponse`, `Module` / `Lesson` / `LessonProgress` |
| Control | `TrialClaim`, `TavusPal`, `AppConfig`, `AuditLog` |

**Reglas que impone la propia base de datos** (no solo el código):
- Los saldos nunca son negativos y lo retenido + consumido + vencido ≤ lo otorgado (restricciones CHECK).
- Una sola clase abierta por usuario, una sola prueba por usuario, una sola entrada activa en la cola y una sola suscripción viva (índices únicos parciales).

### 3.4 Integración con Tavus
**Script `pnpm tavus:setup`** (seguro de repetir; opciones `--dry-run` y `--verify`):
1. Lee el PAL base `p3a4e97dc806` y toma su cara. Si el ID resultara ser una cara, la usa directamente.
2. Crea **3 PALs tutores** con esa misma cara, **sin tocar tu PAL original**: *Tutor EN-US*, *Tutor EN-GB* y *Tutor DE*. Cada uno lleva:
   - **Prompt de tutor para hispanohablantes:**
     - se adapta al nivel; en A1–A2 da como máximo una explicación en español por turno;
     - corrige reformulando, 1–2 correcciones por turno;
     - el alumno habla ≥ 60 % del tiempo;
     - cierra con un resumen de 2 líneas;
     - variante US o UK en vocabulario y ortografía (*flat*, *lift*, *colour*); en alemán, siempre sustantivo con artículo.
   - **Visión:** `perception_model: raven-1` y consultas visuales (“¿qué objeto sostiene o señala el estudiante?”, “¿qué hay en su entorno?”, “¿muestra un texto o pantalla?”, “¿se ve confundido?”). Regla del prompt: nunca comentar el cuerpo, la apariencia o la identidad del alumno, ni objetos privados.
   - **Ritmo de conversación:** `turn_taking_patience: high` e interrupción baja, porque los estudiantes necesitan pensar antes de hablar.
   - **Idiomas:** `[meta, "es"]`, para que entienda al principiante que pasa al español.
   - **Voz:** voz TTS por variante desde `.env`; si se deja vacía, usa la voz de tu PAL base.
   - **Herramientas:** `save_vocabulary` y `log_correction`.
3. Guarda los `pal_id` en `TavusPal`. Si cambias el prompt, actualiza el PAL en lugar de duplicarlo. `--verify` crea una conversación en `test_mode`, con costo $0.

**Por cada clase**, `POST /v2/conversations` con:
- **PAL y nombre:** `pal_id` de la variante y `conversation_name` = `mypal:<idSesión>` (sirve para encontrar las huérfanas).
- **Contexto:** `conversational_context` con nombre, nivel, lección, vocabulario pendiente y errores recientes.
- **Memoria:** `participant_tags` (se omite en la prueba).
- **Seguridad:** `require_auth`, `max_participants: 2` y `callback_url` con un token HMAC.
- **`properties`:**
  - `max_call_duration`;
  - `participant_absent_timeout: 45`;
  - `participant_left_timeout: 15`;
  - `enable_closed_captions`;
  - `languages`: `[meta, "es"]` en A1–A2 y `[meta]` desde B1.
- En desarrollo se envía `test_mode: true`.
- **La creación nunca se reintenta automáticamente**, porque podría generar una segunda conversación cobrada.

**En la sala** (Daily, `join({ url, token })`):
- Se reciben los subtítulos (`conversation.utterance`), quién habla y las herramientas del tutor.
- Se envían los botones rápidos (`conversation.respond`) y, a 1 min del final, la instrucción de cerrar y resumir.
- El navegador envía un latido cada 15 s.

### 3.5 Medición de minutos (núcleo del margen)
1. **Iniciar (una sola transacción):**
   - bloquear la billetera del usuario;
   - evitar el doble clic con una clave de idempotencia;
   - rechazar si ya hay una clase abierta (409, con opción de “continuar”);
   - revisar el interruptor y el presupuesto mensual;
   - calcular `reserva = min(saldo, tope del plan, tope de Tavus)`, exigiendo ≥ 60 s;
   - **tomar un cupo de concurrencia** (`FOR UPDATE SKIP LOCKED`). Si no hay cupo, todo se revierte y el usuario entra a la **cola FIFO**;
   - **retener** la reserva de los cubos en orden: plan → minutos de admin → recargas (la que vence antes primero). La prueba usa solo su propio cubo.
2. **Crear en Tavus**, fuera de la transacción, con `max_call_duration = reserva − 20 s`.
   - **Si Tavus responde OK:** la clase queda lista, con una fecha límite y un trabajo programado para ese momento.
   - **Si hay un error claro:** se libera todo sin cobrar.
   - **Si no sabemos si se creó (timeout):** se busca por nombre. Si aparece, se cierra sin cobrar al usuario; si no, se libera.
3. **Todas las formas de terminar llevan a la misma función, y son seguras de repetir:**
   - botón “Terminar”;
   - cerrar la pestaña (`sendBeacon` con un token firmado);
   - eventos de Daily;
   - webhook `system.shutdown`;
   - corte automático de Tavus;
   - fecha límite;
   - latido perdido (45 s);
   - cierre forzado por el admin.
4. **Confirmar el fin:**
   - un webhook es solo un aviso; el dinero se mueve después de confirmar con `GET /v2/conversations/{id}?verbose=true`;
   - el **cupo se libera en ese momento** y se ofrece al primero de la cola durante 45 s.
5. **Liquidar:**
   - **Reloj único:** inicio y fin de Tavus, o los dos nuestros; nunca se mezclan.
   - **Cobro:** redondeo hacia arriba a 6 s, mínimo 30 s, nunca más que la reserva.
   - **Devolución:** el resto vuelve a sus cubos (si el cubo ya venció, vence ahí mismo).
   - **Costo:** se registra el costo Tavus estimado.
   - **Sin cobro al usuario:** las fallas de Tavus.
6. **Trabajos del worker:**
   - fecha límite de cada clase;
   - barrido cada 10 s (atascadas, sin latido, sin liquidar);
   - consulta a Tavus (cada 5 s en local, donde no llegan webhooks; cada 60 s en producción);
   - cazador de huérfanas cada 60 s;
   - mantenimiento de la cola;
   - vencimiento de cubos;
   - **chequeo nocturno de invariantes** (billetera = suma de cubos = suma del ledger; cupos ocupados = clases abiertas).
7. **Webhook de Tavus** (Tavus no los firma):
   - token HMAC en la URL;
   - el `conversation_id` debe coincidir con la clase;
   - deduplicación;
   - respuesta inmediata, con el trabajo hecho en segundo plano.

### 3.6 Pagos simulados
- **Interfaz `PaymentProvider`:** `createCheckout`, `createTopupCheckout` y `parseWebhook` → eventos normalizados: *ciclo pagado*, *recarga pagada*, *suscripción cambiada*, *reembolso*.
- **`FakeProvider`:**
  - una página de “checkout simulado” envía al webhook interno;
  - ese webhook activa la suscripción y otorga los minutos del ciclo (un cubo PLAN que vence al fin del periodo);
  - el worker simula las renovaciones y el admin tiene un botón “simular renovación”;
  - un reembolso revoca los minutos no usados.
- **Más adelante:** conectar Stripe, Mercado Pago o Wompi es solo agregar un proveedor nuevo.

---

## 4. Fases de implementación (cada una se puede ejecutar y probar)
1. **Base:**
   - Next.js + Tailwind + shadcn, Prisma y las bases `mypal` / `mypal_test`;
   - validación del `.env`, `.gitignore`, `git init`, Vitest y Playwright;
   - `/api/health`.
2. **Landing page completa** (precios leídos del seed) y **autenticación** (registro, verificación, login, recuperación, Turnstile).
3. **Diagnóstico:**
   - banco de preguntas EN/DE por nivel y motor adaptativo;
   - script `pnpm audio:generate`, que crea los MP3 de escucha con ElevenLabs (voces US, UK y DE) junto con un manifiesto;
   - ejercicios de habla con Scribe v2;
   - intentos anónimos que se ligan al registrarse.
4. **Núcleo de minutos:** billetera, cubos, retener/cobrar/liberar/vencer, concesiones del admin, invariantes y arranque del worker.
5. **Tavus en `test_mode`:**
   - cliente real y falso;
   - script de setup (3 tutores);
   - máquina de estados completa, cupos y cola, y todos los trabajos del worker.
6. **Sala de video real + prueba de 5 min + paywall.** Incluye la **calibración**: 5 llamadas reales cortas (≈ $2–4) para medir los retrasos de conexión y cierre y fijar los 20 s de seguridad, comparando nuestros segundos con el panel de Tavus.
7. **Pagos simulados:** planes, recargas, renovación, cancelación y reembolso.
8. **Aprendizaje:** transcripción, resumen, vocabulario y correcciones (herramientas del tutor), repaso espaciado, módulos y lecciones con actividades de visión, progreso y rachas.
9. **Panel admin:** márgenes, clases en vivo, cola, usuarios y ledger, editor de planes con validación del 60 %, configuración y auditoría.
10. **Endurecimiento:**
    - límites de tasa, alertas y cabeceras de seguridad;
    - páginas legales y consentimiento de cámara;
    - README y guía de operación.

## 5. Verificación
- **Unitarias (Vitest):**
  - redondeo a 6 s y mínimo de 30 s;
  - orden de consumo de los cubos;
  - liquidación (cobro en orden, devolución y vencimiento);
  - cálculo de la reserva con cada combinación de topes;
  - transiciones de estado permitidas;
  - convergencia del test adaptativo;
  - **un test que falla si algún plan o recarga queda por debajo del 60 % de margen** al 100 % de uso (también como `pnpm check:pricing`).
- **Pruebas de propiedades (fast-check):** secuencias aleatorias de otorgar, iniciar, liquidar, vencer, reembolsar y ajustar. Nada debe quedar negativo y siempre debe cumplirse billetera = Σ cubos = Σ ledger.
- **Integración** (Postgres real `mypal_test` + Tavus falso):
  - 20 solicitudes simultáneas del mismo usuario → 1 sola clase;
  - 10 usuarios con límite 3 → 3 en clase y 7 en cola en orden; al terminar uno, entra el siguiente;
  - fin por botón + webhook + fecha límite al mismo tiempo → un solo cobro;
  - timeout de Tavus → huérfana adoptada sin cobro o liberada;
  - cubo que vence o reembolso a mitad de clase;
  - eventos de pago duplicados → minutos otorgados una sola vez.
- **Contrato con Tavus real, a costo $0:** `pnpm tavus:setup --verify` y conversaciones en `test_mode` con nuestro payload exacto.
- **E2E (Playwright, cámara y micrófono simulados):**
  - landing → registro → verificación → diagnóstico → prueba → paywall → checkout simulado → minutos visibles → clase pagada;
  - segundo intento de prueba bloqueado;
  - el editor de planes rechaza un plan con menos del 60 %.
- **Prueba real controlada** (≈ $1–4):
  - mostrar una taza y preguntar “What is this?” (visión);
  - comparar los acentos US, UK y DE;
  - dejar el saldo en 90 s y confirmar que Tavus corta solo;
  - comparar los segundos cobrados con el panel de Tavus.
- **Ejecución local:** `pnpm dev` (http://localhost:3000) + `pnpm worker`.

## 6. Riesgos y notas
- **Rota tu API key de Tavus:** se compartió en texto plano en este chat. Irá solo en `.env.local` (fuera de git) y nunca llega al navegador. Regenérala antes de producción.
- **Precio frente a tutores humanos:** ≈ $1,15/min (≈ $69/hora), más caro que un tutor online (~$15–30/h).
  - **Diferencial:** disponible 24/7, sin vergüenza a equivocarse, visión del entorno y 3 acentos. Además se incluye práctica gratuita (diagnóstico, repaso de vocabulario, escucha).
  - **A futuro:** un modo de práctica solo voz/texto con un LLM barato.
- **Builder permite solo 3 clases simultáneas:** habrá cola en horas pico hasta pasar a Growth.
- **Acento UK vs. US:** depende de la voz TTS. Si tu avatar usa una voz clonada propia, ambos tutores sonarán igual. Por eso cada tutor tendrá su voz configurable; en la fase 5 te propondré voces concretas.
- **Por confirmar con Tavus durante la fase 5:**
  - si `max_call_duration` cuenta desde la creación o desde la entrada del usuario;
  - el formato exacto del PATCH de PALs;
  - el listado de conversaciones activas (lo necesita el cazador de huérfanas);
  - el formato de las herramientas del LLM;
  - si la visión (raven-1) tiene costo extra; si lo tiene, se suma al costo por minuto.
- **Privacidad:**
  - Tavus procesa el video del estudiante (visión), así que habrá consentimiento explícito de cámara antes de la primera clase;
  - política de privacidad (Ley 1581 si operas en Colombia);
  - solo mayores de 18 años en v1.
- **Nombre:** “PAL” es el nombre de un producto de Tavus. “MyPAL” queda como nombre de trabajo y se cambia en un solo archivo.
- **Precios de Tavus:** su web muestra varias versiones. Confirma el costo de $0,35 por minuto extra en tu panel de facturación de Tavus. Si cambia, se ajusta el costo por minuto y el test de margen avisa si algún plan baja del 60 %.
- **Moneda:** USD en v1. La pasarela real definirá COP u otras monedas locales.
- **Producción (más adelante):** el worker necesita un proceso siempre encendido (Railway, Render, Fly o un VPS), y los webhooks necesitan una URL pública.
