/**
 * Prepara el bucket de S3 de MyPAL (idempotente). Nombre y region vienen de .env:
 *   S3_BUCKET, AWS_REGION, S3_PREFIX
 *
 *   pnpm s3:setup             # crea (si falta) y configura el bucket
 *   pnpm s3:setup --check     # solo verifica acceso (sube, lee y borra un archivo)
 *
 * Configuracion aplicada:
 *  - bloqueo total de acceso publico (todo se sirve con URLs prefirmadas),
 *  - cifrado por defecto (SSE-S3),
 *  - CORS para que el navegador lea audios desde APP_URL,
 *  - ciclo de vida: borra grabaciones de Speaking y temporales al vencer su plazo.
 */
import "dotenv/config";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}

async function main() {
  const bucket = required("S3_BUCKET");
  const region = required("AWS_REGION");
  const prefix = (process.env.S3_PREFIX ?? "mypal").replace(/\/+$/, "");
  const recordingsDays = Number(process.env.S3_RECORDINGS_RETENTION_DAYS ?? 180);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const s3 = new S3Client({ region });

  let exists = true;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 403) throw new Error(`El bucket ${bucket} existe pero estas credenciales no tienen acceso (o pertenece a otra cuenta).`);
    exists = false;
  }

  if (process.argv.includes("--check")) {
    if (!exists) throw new Error(`El bucket ${bucket} no existe. Ejecuta pnpm s3:setup`);
  } else {
    if (!exists) {
      await s3.send(
        new CreateBucketCommand({
          Bucket: bucket,
          ...(region === "us-east-1" ? {} : { CreateBucketConfiguration: { LocationConstraint: region as BucketLocationConstraint } }),
        }),
      );
      console.log(`✔ bucket ${bucket} creado en ${region}`);
    } else {
      console.log(`= bucket ${bucket} ya existe`);
    }
    await s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
    await s3.send(
      new PutBucketEncryptionCommand({
        Bucket: bucket,
        ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
      }),
    );
    const origins = [...new Set([appUrl, ...(process.env.S3_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)])];
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [{ AllowedMethods: ["GET", "HEAD", "PUT"], AllowedOrigins: origins, AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }],
        },
      }),
    );
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "speaking-recordings-retention",
              Status: "Enabled",
              Filter: { Prefix: `${prefix}/recordings/` },
              Expiration: { Days: recordingsDays },
            },
            { ID: "tmp-cleanup", Status: "Enabled", Filter: { Prefix: `${prefix}/tmp/` }, Expiration: { Days: 1 } },
            {
              ID: "abort-incomplete-uploads",
              Status: "Enabled",
              Filter: { Prefix: `${prefix}/` },
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 },
            },
          ],
        },
      }),
    );
    console.log(`✔ acceso publico bloqueado, cifrado, CORS (${origins.join(", ")}) y ciclo de vida (${recordingsDays} dias)`);
  }

  // Prueba de escritura y lectura.
  const key = `${prefix}/tmp/healthcheck-${Date.now()}.txt`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await got.Body?.transformToString();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  if (body !== "ok") throw new Error("La prueba de lectura no coincidio");
  console.log(`✔ acceso verificado (escritura, lectura y borrado en ${prefix}/tmp/)`);
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
