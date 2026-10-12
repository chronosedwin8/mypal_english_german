import { BarChart3Icon, CheckIcon, ClipboardListIcon, GraduationCapIcon, ShieldCheckIcon, UsersIcon, VideoIcon } from "lucide-react";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EXAMS, EXAM_CODES } from "@/content/exams";
import { ORG_LICENSES, formatUsd } from "@/lib/pricing/catalog";

import { requestDemoAction } from "./actions";

export const metadata = {
  title: "MyPAL para colegios, universidades y empresas",
  description: "Preparación de IELTS, Goethe y TestDaF para grupos: panel docente, simulacros institucionales, estadísticas y tutor con IA. Licencias desde $10 por estudiante al mes.",
};

const FEATURES = [
  { icon: BarChart3Icon, title: "Panel docente", text: "Semáforo por estudiante, nota estimada del grupo y un mapa de los tipos de pregunta donde más fallan." },
  { icon: ClipboardListIcon, title: "Tareas y simulacros institucionales", text: "Asigna práctica, Writing, Speaking o un simulacro con la misma forma para todo el grupo, con fecha de cierre." },
  { icon: GraduationCapIcon, title: "Revisión humana", text: "Lee cada texto y escucha cada grabación; tu nota reemplaza la de la IA y la ve el estudiante." },
  { icon: UsersIcon, title: "Altas en minutos", text: "Invitación por enlace, código de grupo o carga de una lista; cada estudiante activo ocupa una licencia." },
  { icon: VideoIcon, title: "Tutor con avatar en el aula", text: "Conversación por video con un tutor de IA, también para estudiantes desde 15 años bajo supervisión." },
  { icon: ShieldCheckIcon, title: "Menores de edad, con cuidado", text: "Sin compras ni correos comerciales, reglas de seguridad en cada clase y datos que nunca se usan para entrenar modelos." },
];

export default function InstitutionsPage(props: PageProps<"/instituciones">) {
  return (
    <div className="pb-24">
      <section className="bg-gradient-to-b from-primary/10 to-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="font-semibold text-primary">Para colegios, universidades y empresas</p>
          <h1 className="mt-2 max-w-3xl font-heading text-4xl font-extrabold tracking-tight sm:text-6xl">Prepara a tus grupos para IELTS, Goethe y TestDaF</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            El mismo motor de exámenes de MyPAL, con un panel para tus docentes: ven el avance de cada estudiante, asignan práctica y simulacros y revisan Writing y Speaking.
          </p>
          <a href="#demo" className="mt-8 inline-flex h-12 items-center rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground hover:bg-primary/90">
            Solicita una demo
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border bg-card p-6">
              <f.icon className="size-6 text-primary" />
              <p className="mt-3 font-heading text-lg font-bold">{f.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center font-heading text-3xl font-extrabold tracking-tight">Licencias por estudiante</h2>
          <p className="mt-2 text-center text-muted-foreground">Cobro por semestre o año. Las cuentas de docente no ocupan licencia.</p>
          <div className="mx-auto mt-8 grid max-w-3xl gap-6 md:grid-cols-2">
            {ORG_LICENSES.map((l) => (
              <div key={l.id} className="rounded-3xl border bg-card p-6">
                <p className="font-heading text-xl font-bold">{l.nameEs}</p>
                <p className="mt-2">
                  <span className="font-heading text-4xl font-extrabold">{formatUsd(l.priceUsdCents)}</span>
                  <span className="text-muted-foreground"> por estudiante al mes</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {l.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Los cupos forman una bolsa de la institución. Minutos con el tutor con avatar como bolsa opcional. Prueba de 30 días con práctica autocalificada.
          </p>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
        <h2 className="font-heading text-3xl font-extrabold tracking-tight">Solicita una demo</h2>
        <p className="mt-2 text-muted-foreground">Te escribimos en menos de dos días hábiles.</p>
        <Suspense fallback={null}>
          <Notice searchParams={props.searchParams} />
        </Suspense>
        <form action={requestDemoAction} className="mt-6 grid gap-4 sm:grid-cols-2">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Institución
            <input name="institution" required className="h-10 w-full rounded-xl border bg-background px-3" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Tipo
            <select name="type" className="h-10 w-full rounded-xl border bg-background px-3">
              <option value="SCHOOL">Colegio</option>
              <option value="UNIVERSITY">Universidad</option>
              <option value="COMPANY">Empresa</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Número de estudiantes
            <input name="students" type="number" min={1} required className="h-10 w-full rounded-xl border bg-background px-3" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Tu nombre
            <input name="contactName" required className="h-10 w-full rounded-xl border bg-background px-3" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Correo
            <input name="email" type="email" required className="h-10 w-full rounded-xl border bg-background px-3" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Teléfono (opcional)
            <input name="phone" className="h-10 w-full rounded-xl border bg-background px-3" />
          </label>
          <fieldset className="space-y-1.5 text-sm font-medium">
            <legend>Exámenes de interés</legend>
            <div className="flex flex-wrap gap-2">
              {EXAM_CODES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 rounded-lg border px-2 py-1 font-normal">
                  <input type="checkbox" name="exams" value={c} className="accent-primary" /> {EXAMS[c].shortName}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Mensaje (opcional)
            <Textarea name="message" rows={3} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" className="h-11 rounded-full px-7">
              Enviar solicitud
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

async function Notice({ searchParams }: { searchParams: PageProps<"/instituciones">["searchParams"] }) {
  const sp = await searchParams;
  if (sp.enviado)
    return <p className="mt-4 rounded-2xl border border-mint bg-mint/15 px-4 py-3 text-sm">¡Gracias! Recibimos tu solicitud y te contactaremos pronto.</p>;
  if (typeof sp.error === "string") return <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{sp.error}</p>;
  return null;
}
