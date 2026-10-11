import { Logo } from "@/components/marketing/logo";
import { TutorAvatar } from "@/components/marketing/tutor-avatar";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-[oklch(0.5_0.22_310)] to-coral lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative size-80">
          <TutorAvatar speaking />
        </div>
        <blockquote className="relative mt-6 max-w-sm rounded-3xl bg-white/95 p-6 text-center text-[#22183d] shadow-2xl">
          <p className="font-heading text-xl font-bold">“Hi! Ready to chat?”</p>
          <p className="mt-2 text-sm text-[#5b4f7a]">Tu tutora te espera. Primero, crea tu cuenta.</p>
        </blockquote>
      </aside>
    </div>
  );
}
