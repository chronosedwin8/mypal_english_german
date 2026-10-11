/**
 * Crea/actualiza los 3 PALs tutores (EN-US, EN-GB, DE) a partir de tu PAL base,
 * SIN modificar el PAL base. Seguro de repetir.
 *
 *   pnpm tavus:setup             # crea o actualiza lo que haga falta
 *   pnpm tavus:setup --dry-run   # muestra que haria
 *   pnpm tavus:setup --verify    # ademas crea una conversacion en test_mode por tutor (costo $0)
 *   pnpm tavus:setup --force     # actualiza aunque no haya cambios
 *   pnpm tavus:setup --fake      # contra el simulador (tests)
 */
import "dotenv/config";

import { db } from "@/server/db";
import type { TavusPalRecord } from "@/server/tavus";
import { FakeTavusClient } from "@/server/tavus/fake-client";
import { HttpTavusClient } from "@/server/tavus/http-client";
import { TUTOR_VARIANTS, buildPalSpec, palName, specHash } from "@/server/tavus/pal-spec";
import { TUTOR_TOOLS } from "@/server/tavus/prompts";

const dryRun = process.argv.includes("--dry-run");
const verify = process.argv.includes("--verify");
const force = process.argv.includes("--force");

/** Si el PAL base tiene memoria, los tutores tambien (recuerdan al alumno entre clases). */
async function attachMemory(client: { attachSkill: (p: string, s: string, c?: Record<string, unknown>) => Promise<void> }, base: TavusPalRecord | null, palId: string) {
  const memory = (base?.skills as Record<string, { config?: Record<string, unknown> }> | undefined)?.memory;
  if (!memory) return;
  try {
    await client.attachSkill(palId, "memory", memory.config && Object.keys(memory.config).length ? memory.config : undefined);
  } catch (e) {
    console.warn(`  ! no pude adjuntar la memoria a ${palId}: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  // El setup habla con Tavus real (aunque la app use el simulador); --fake para pruebas.
  const client = process.argv.includes("--fake") ? new FakeTavusClient() : new HttpTavusClient();
  const baseId = process.env.TAVUS_BASE_PAL_ID?.trim();
  if (!baseId) throw new Error("Falta TAVUS_BASE_PAL_ID en .env");

  console.log(`Driver: ${client.driver}`);
  const base: TavusPalRecord | null = await client.getPal(baseId);
  const faceId = process.env.TAVUS_FACE_ID?.trim() || base?.default_face_id || (baseId.startsWith("r") ? baseId : null);
  if (!faceId) throw new Error(`No pude obtener la cara del PAL base ${baseId}`);
  console.log(`PAL base: ${base?.pal_name ?? "(no encontrado)"} (${baseId}) · cara ${faceId}`);

  // 1) Herramientas (vocabulario y correcciones) — nombres unicos por cuenta.
  const existingTools = await client.listTools();
  const toolIds: string[] = [];
  for (const def of TUTOR_TOOLS) {
    const found = existingTools.find((t) => t.name === def.name);
    if (found) {
      toolIds.push(found.tool_id);
      continue;
    }
    if (dryRun) {
      console.log(`  · crearia la herramienta ${def.name}`);
      continue;
    }
    const created = await client.createTool({
      name: def.name,
      description: def.description,
      parameters: def.parameters as unknown as Record<string, unknown>,
      delivery: { app_message: true },
      trigger_type: "in_call",
      origin: "llm",
      on_call: "silent",
      on_resolve: "fire_and_forget",
    });
    toolIds.push(created.tool_id);
    console.log(`  ✔ herramienta ${def.name} (${created.tool_id})`);
  }

  // 2) Tutores
  for (const variant of TUTOR_VARIANTS) {
    const spec = buildPalSpec(variant, base ?? { pal_id: baseId }, faceId);
    const hash = specHash(spec);
    const row = await db.tavusPal.findUnique({ where: { variant } });
    const remote = row ? await client.getPal(row.palId) : null;

    if (row && remote && row.specHash === hash && !force) {
      console.log(`  = ${palName(variant)} sin cambios (${row.palId})`);
      if (!dryRun) {
        await client.attachTools(row.palId, toolIds);
        await attachMemory(client, base, row.palId);
      }
      continue;
    }
    if (dryRun) {
      console.log(`  · ${row && remote ? "actualizaria" : "crearia"} ${palName(variant)}`);
      continue;
    }

    let palId: string;
    if (row && remote) {
      const ops = Object.entries(spec).map(([k, v]) => ({ op: "add", path: `/${k}`, value: v }));
      await client.patchPal(row.palId, ops);
      palId = row.palId;
      console.log(`  ✔ actualizado ${palName(variant)} (${palId})`);
    } else {
      const created = await client.createPal(spec);
      palId = created.pal_id;
      console.log(`  ✔ creado ${palName(variant)} (${palId})`);
    }
    await client.attachTools(palId, toolIds);
    await attachMemory(client, base, palId);
    await db.tavusPal.upsert({
      where: { variant },
      create: { variant, palId, faceId, basePalId: baseId, palName: palName(variant), specHash: hash, lastSyncedAt: new Date() },
      update: { palId, faceId, basePalId: baseId, palName: palName(variant), specHash: hash, lastSyncedAt: new Date() },
    });
  }

  // 3) Verificacion sin costo
  if (verify && !dryRun) {
    for (const row of await db.tavusPal.findMany()) {
      const conv = await client.createConversation({
        pal_id: row.palId,
        conversation_name: `mypal:verify:${row.variant}`,
        test_mode: true,
        properties: { max_call_duration: 60, participant_absent_timeout: 15, participant_left_timeout: 5 },
      });
      await db.tavusPal.update({ where: { variant: row.variant }, data: { lastVerifiedAt: new Date() } });
      console.log(`  ✔ verificado ${row.palName}: conversacion ${conv.conversation_id} (${conv.status})`);
    }
  }
  console.log("Listo.");
}

main()
  .catch((err) => {
    console.error("✖", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
