"use client";

import { Building2Icon, GraduationCapIcon, LockIcon, LogOutIcon, ShieldIcon, MoonIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

export function UserMenuClient({
  name,
  email,
  isAdmin,
  isTeacher = false,
  isOrgAdmin = false,
}: {
  name: string;
  email: string;
  isAdmin: boolean;
  isTeacher?: boolean;
  isOrgAdmin?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-9 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
        aria-label="Menú de usuario"
      >
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <ShieldIcon /> Administración
          </DropdownMenuItem>
        )}
        {isTeacher && (
          <DropdownMenuItem render={<Link href="/docente" />}>
            <GraduationCapIcon /> Panel docente
          </DropdownMenuItem>
        )}
        {isOrgAdmin && (
          <DropdownMenuItem render={<Link href="/institucion" />}>
            <Building2Icon /> Institución
          </DropdownMenuItem>
        )}
        <DropdownMenuItem render={<Link href="/app/seguridad" />}>
          <LockIcon /> Seguridad y privacidad
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />} Tema {resolvedTheme === "dark" ? "claro" : "oscuro"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOutIcon /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
