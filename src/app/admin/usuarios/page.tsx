import Link from "next/link";
import { Suspense } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaff } from "@/server/auth/dal";
import { db } from "@/server/db";

export const metadata = { title: "Admin · Usuarios" };

export default function UsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const q = typeof (await searchParams).q === "string" ? ((await searchParams).q as string).trim() : "";
  const users = await db.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { wallet: true, subscriptions: { where: { status: { in: ["ACTIVE", "PAST_DUE"] } } } },
  });
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-extrabold">Usuarios</h1>
      <form>
        <Input name="q" defaultValue={q} placeholder="Buscar por correo o nombre" className="max-w-sm" />
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="p-3">Usuario</th>
              <th>Plan</th>
              <th>Disponible</th>
              <th>Alta</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">
                  <Link href={`/admin/usuarios/${u.id}`} className="font-medium text-primary hover:underline">
                    {u.email}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {u.name} {u.role === "ADMIN" && "· ADMIN"} {!u.emailVerified && "· sin verificar"}
                  </span>
                </td>
                <td>{u.subscriptions[0]?.planId ?? "—"}</td>
                <td className="tabular-nums">{Math.floor((u.wallet?.availableSeconds ?? 0) / 60)} min</td>
                <td>{u.createdAt.toLocaleDateString("es")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
