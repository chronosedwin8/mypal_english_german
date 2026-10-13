# MyPAL — Tutor de idiomas con avatar IA

Práctica conversacional de **inglés (EE. UU. y Reino Unido) y alemán** por video con un tutor de IA de [Tavus](https://www.tavus.io) que **ve el entorno del estudiante** (visión `raven-1`). El plan completo y las decisiones de negocio están en [`docs/PLAN.md`](docs/PLAN.md).

## Qué incluye

- **Landing** ilustrativa con precios claros (`/`).
- **Test de nivel gratis sin registro** (`/test-de-nivel`): adaptativo (IRT), audios con voces nativas de ElevenLabs y parte oral transcrita con Scribe.
- **Cuenta** con verificación de correo, recuperación de contraseña y Cloudflare Turnstile.
- **Clase gratis de 5 minutos** (una por persona) y **paywall**.
- **Sala de clase** con el tutor: subtítulos, cuenta regresiva, botones rápidos, vocabulario y correcciones guardados por el tutor, resumen posterior.
- **Minutos con tope duro**: reserva previa, `max_call_duration` en Tavus, cobro al segundo (redondeo a 6 s, mínimo 30 s), cola cuando los cupos simultáneos están llenos.
- **Pagos simulados** (planes, recargas, renovación, cancelación, reembolso) detrás de una interfaz intercambiable.
- **Panel de administración** (`/admin`): márgenes real / peor caso / con fijo de Tavus, clases en vivo, usuarios, ledger, configuración e interruptor de emergencia.
- **Exámenes** (`/app/examenes`, plan en [`docs/PLAN-EXAMENES.md`](docs/PLAN-EXAMENES.md)): IELTS Academic, Goethe B1/B2/C1 y TestDaF con banco generado por Gemini y validado, audios de ElevenLabs en S3, práctica, simulacro con escalas oficiales, Writing y Speaking calificados por IA con examinador de voz, plan de estudios, productos de $15 / $19 / $35 e instituciones con panel docente (estudiantes de 15 a 17 años solo por su institución).
- **Operación**: segundo factor obligatorio para el admin en producción, rol de soporte de solo lectura, accesos y excepciones, moderación y "reportar pregunta", costos, auditoría con CSV, calibración Rasch con uso real y precisión frente a notas oficiales y docentes.

## Precios (margen mínimo garantizado ≥ 60 %)

| Producto | Precio | Minutos | Margen mínimo |
|---|---|---|---|
| Básico | $25/mes | 20 | 61,2 % |
| Fluido | $69/mes | 60 | 60,7 % |
| Inmersión | $135/mes | 120 | 60,5 % |
| Recarga | $19 | 15 | 63,2 % |
| Recarga | $36 | 30 | 62,3 % |

Fuente única: `src/lib/pricing/catalog.ts`. `pnpm check:pricing` (y los tests) fallan si algún producto baja del 60 %.

## Puesta en marcha (Windows, local)

Requisitos: Node 24, pnpm 9, PostgreSQL 17 corriendo localmente.

```bash
pnpm install
cp .env.example .env          # y completa los valores (ver abajo)
pnpm db:create                # crea las bases mypal y mypal_test
pnpm db:deploy                # aplica las migraciones
pnpm db:seed                  # planes, preguntas del test, lecciones, cupos
pnpm audio:generate           # (una sola vez) audios del test con ElevenLabs
pnpm tavus:setup --verify     # crea los 3 tutores en Tavus (costo $0)
```

Luego, en dos terminales:

```bash
pnpm dev       # http://localhost:3000
pnpm worker    # vigilantes de clases, cola, vencimientos, renovaciones
```

Hazte administrador: regístrate en la app y ejecuta `pnpm admin:promote tu-correo@ejemplo.com`, o crea la cuenta directamente con `ADMIN_PASSWORD='…' pnpm admin:create tu-correo@ejemplo.com "Tu nombre"` (la contraseña solo se lee de la variable de entorno; nunca la guardes en archivos). En producción el admin exige el segundo factor: actívalo en **Seguridad y privacidad** (`/app/seguridad`).

En local los correos no se envían: ábrelos en **http://localhost:3000/dev/correo**.

### Variables de entorno principales

| Variable | Para qué |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_TEST` | Postgres (app y tests) |
| `BETTER_AUTH_SECRET`, `HASH_PEPPER`, `TAVUS_WEBHOOK_SECRET` | Secretos aleatorios |
| `TAVUS_API_KEY`, `TAVUS_BASE_PAL_ID` | Tavus (PAL base “Poly”; no se modifica) |
| `TAVUS_DRIVER` | `fake` = simulador sin costo (por defecto) · `http` = **Tavus real, cada clase gasta minutos** |
| `PUBLIC_WEBHOOK_URL` | URL pública para webhooks de Tavus (vacía en local: el worker consulta a Tavus) |
| `TAVUS_VOICE_EN_US/EN_GB/DE` | Voces por tutor (vacías = voz del PAL base) |
| `ELEVENLABS_API_KEY` | Audios y transcripción del test de nivel |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (en local: claves de prueba) |
| `GEMINI_API_KEY`, `GEMINI_MODEL_PRO`, `GEMINI_MODEL_FLASH`, `AI_DRIVER` | Generación del banco y calificación (`AI_DRIVER=fake` para pruebas) |
| `ELEVENLABS_DIALOGUE_MODEL`, `ELEVENLABS_EXAMINER_MODEL`, `ELEVENLABS_EXAM_VOICES_*`, `ELEVENLABS_EXAMINER_*` | Audios del banco y voz del examinador |
| `AWS_*`, `S3_BUCKET`, `S3_PREFIX`, `S3_RECORDINGS_RETENTION_DAYS` | Bucket privado de audios (`pnpm s3:setup`); el ciclo de vida del bucket es solo un techo de seguridad |
| `MINORS_AI_DRIVER` | Proveedor de IA en vivo para menores (vacío = sin corrección por IA para menores) |
| `ADMIN_REQUIRE_2FA` | Segundo factor para el admin (vacío = solo en producción) |

### Probar con el avatar real

1. En `.env`, `TAVUS_DRIVER=http` y reinicia `pnpm dev` y `pnpm worker`.
2. Cada clase consume minutos reales de tu plan Tavus. La prueba gratis cuesta ≈ $1,85.
3. Para pruebas cortas y baratas, baja `trial.seconds` desde `/admin/configuracion`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm test` | Tests unitarios (precios, cobro, motor del test, ledger puro) |
| `pnpm test:int` | Integración con Postgres real (`mypal_test`) y Tavus simulado |
| `pnpm e2e` | Recorrido completo en Chrome (Tavus y pagos simulados) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | Calidad y build de producción |
| `pnpm check:pricing` | Verifica el margen de todos los productos |
| `pnpm tavus:setup [--dry-run] [--verify] [--force]` | Crea/actualiza los tutores en Tavus |
| `pnpm bank inventory \| import \| form \| audio` | Banco de exámenes: el contenido lo escribe el equipo en `bank-src/` (fuera de git) y se carga con `pnpm bank import bank-src/...` |
| `pnpm s3:setup [--check]` | Crea o verifica el bucket privado de audios |
| `pnpm admin:create` · `pnpm admin:promote` | Cuenta de administrador |

### Operación de exámenes (worker)

- **Banco**: la API de IA no se usa para crear preguntas ni guiones. Cada bloque se escribe en JSON (`bank-src/`, fuera de git porque contiene las claves de respuesta), `pnpm bank import` lo valida con código, genera y verifica el audio de Listening/Hören y lo aprueba. `--dry-run` valida sin guardar.
- **Calibración diaria** (`/admin/calibracion`, botón *Calibrar ahora*): Rasch con las respuestas reales. Con `exam.calibration.minResponses` respuestas por pregunta se guardan su dificultad y discriminación. Las preguntas defectuosas mandan su bloque a revisión y dejan una alerta en Moderación. Las formas IELTS completas reciben su propia tabla de conversión, que los simulacros usan desde ese momento.
- **Precisión**: el simulador frente a las notas oficiales que reportan los estudiantes (meta ±0,5 banda) y la IA frente a los docentes. Si el sesgo es claro, ajusta `exam.grader.ieltsWritingOffset` / `ieltsSpeakingOffset`.
- **Grabaciones de Speaking**: se borran al vencer el plazo de la institución (o `exam.recordings.retentionDays` sin institución). Cada persona puede borrarlas antes en `/app/seguridad`. Se conservan la transcripción y la nota.
- **Examinador con avatar** (opcional, `exam.avatarExaminer`): lecciones del tutor en video que hacen de examinador IELTS, Goethe o TestDaF. Usan los minutos del tutor.

## Arquitectura (resumen)

- **Next.js 16** (App Router, Cache Components) + Tailwind v4 + shadcn/ui (Base UI) + Motion.
- **Prisma 7** + PostgreSQL. Los minutos viven en un **ledger de solo inserción** con CHECKs que impiden saldos negativos (`prisma/migrations/*_init`).
- **Better Auth** para cuentas. **Daily** (vía Tavus) para el video.
- `src/server/sessions/lifecycle.ts`: inicio atómico (billetera bloqueada, cupo `SKIP LOCKED`, reserva), creación en Tavus sin reintentos, cierre idempotente, liquidación con reloj único.
- `worker/index.ts`: fechas límite, ausencias, latidos, conversaciones huérfanas, cola, vencimientos, renovaciones, invariantes.
- `src/server/payments/`: interfaz de pasarela + proveedor simulado. Para Stripe / Mercado Pago / Wompi, implementa la interfaz y traduce sus webhooks a `PaymentEvent`.

## Pendientes antes de producción

- Rotar la API key de Tavus (se compartió en texto plano durante el desarrollo).
- Conectar la pasarela de pagos real y un proveedor de correo.
- Revisar con un abogado los textos de `/legal/terminos` y `/legal/privacidad`.
- Desplegar el worker como proceso permanente y configurar `PUBLIC_WEBHOOK_URL`.
- Hacer las llamadas de calibración reales (ver `docs/PLAN.md`, fase 6) y confirmar el costo por minuto en el panel de Tavus.
- Rotar las claves de AWS (también se compartieron en texto plano).
- Ampliar el banco (hoy hay una forma completa de simulacro por examen alemán; IELTS necesita completar algunas partes) escribiendo más bloques en `bank-src/` e importándolos.
- Configurar `MINORS_AI_DRIVER` antes de vender a colegios con estudiantes menores.
- Piloto con 20–30 estudiantes reales para calibrar formas y comparar con notas oficiales y de docentes.
