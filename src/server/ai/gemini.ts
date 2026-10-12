/**
 * Cliente de Gemini (Google). La clave SOLO se lee de GEMINI_API_KEY y nunca se imprime.
 * Salida JSON con esquema (responseJsonSchema) validada con Zod; si no valida, se pide
 * una correccion una vez. Cada llamada queda registrada en AiUsage con su costo.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { getConfig } from "@/server/config";

import { AiError, type AiCallOptions, type AiProvider, type AiResult } from "./provider";
import { assertBudget, recordAiUsage, tokenCostMicroUsd } from "./usage";

let client: GoogleGenAI | null = null;

function genai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AiError("NOT_CONFIGURED", "Falta GEMINI_API_KEY en .env");
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

/** JSON Schema compatible: sin $schema y sin claves que Gemini no necesita. */
function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;

  async generateJson<T>(opts: AiCallOptions<T>): Promise<AiResult<T>> {
    await assertBudget();
    const config = await getConfig();
    const model = config[opts.modelKey];
    if (!model) throw new AiError("NOT_CONFIGURED", `No hay modelo configurado para ${opts.modelKey} (revisa GEMINI_MODEL_* en .env)`);

    const responseJsonSchema = toGeminiSchema(opts.schema);
    let prompt = opts.prompt;
    let totalIn = 0;
    let totalOut = 0;
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [{ text: prompt }];
      if (opts.audio) parts.push({ inlineData: { data: opts.audio.data.toString("base64"), mimeType: opts.audio.mimeType } });
      let response;
      try {
        response = await genai().models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: opts.system,
            responseMimeType: "application/json",
            responseJsonSchema,
            temperature: opts.temperature ?? 0.7,
            maxOutputTokens: opts.maxOutputTokens,
          },
        });
      } catch (err) {
        await recordAiUsage({
          provider: "gemini",
          model,
          purpose: opts.purpose,
          costMicroUsd: BigInt(0),
          userId: opts.userId,
          refId: opts.refId,
          ok: false,
        });
        throw new AiError("PROVIDER_ERROR", `Gemini falló: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
      }
      const usage = response.usageMetadata;
      const inTok = usage?.promptTokenCount ?? 0;
      // El razonamiento interno se cobra como salida.
      const outTok = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
      totalIn += inTok;
      totalOut += outTok;
      const cost = await tokenCostMicroUsd(model, inTok, outTok);
      const text = response.text ?? "";
      let parsed: T | null = null;
      try {
        const result = opts.schema.safeParse(JSON.parse(text));
        if (result.success) parsed = result.data;
        else lastError = result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      } catch {
        lastError = "La respuesta no es JSON válido.";
      }
      await recordAiUsage({
        provider: "gemini",
        model,
        purpose: opts.purpose,
        inputTokens: inTok,
        outputTokens: outTok,
        costMicroUsd: cost,
        userId: opts.userId,
        refId: opts.refId,
        ok: parsed !== null,
      });
      if (parsed !== null) {
        return { data: parsed, model, inputTokens: totalIn, outputTokens: totalOut, costMicroUsd: await tokenCostMicroUsd(model, totalIn, totalOut) };
      }
      prompt = `${opts.prompt}\n\nYour previous answer did not match the required JSON schema. Problems: ${lastError}\nReturn ONLY corrected JSON that matches the schema exactly.`;
    }
    throw new AiError("INVALID_OUTPUT", `La IA no produjo JSON válido: ${lastError}`);
  }
}
