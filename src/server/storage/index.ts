/**
 * Almacenamiento de archivos (audios del banco, grabaciones de Speaking, graficos).
 *  - STORAGE_DRIVER=s3 (por defecto si hay S3_BUCKET): bucket privado + URLs prefirmadas.
 *  - STORAGE_DRIVER=memory: en memoria (tests).
 * Bucket, region y prefijo vienen de .env.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface Storage {
  readonly driver: "s3" | "memory";
  put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
  /** URL temporal de lectura. */
  signedUrl(key: string, seconds: number): Promise<string>;
}

function prefix(): string {
  return (process.env.S3_PREFIX ?? "mypal").replace(/\/+$/, "");
}

/** Claves ordenadas por tipo de contenido. */
export const storageKeys = {
  bankAudio: (exam: string, itemSetId: string, n = 0) => `${prefix()}/exams/${exam.toLowerCase()}/audio/${itemSetId}-${n}.mp3`,
  bankImage: (exam: string, itemSetId: string) => `${prefix()}/exams/${exam.toLowerCase()}/images/${itemSetId}.svg`,
  examinerAudio: (exam: string, hash: string) => `${prefix()}/exams/${exam.toLowerCase()}/examiner/${hash}.mp3`,
  recording: (userId: string, attemptId: string, name: string) => `${prefix()}/recordings/${userId}/${attemptId}/${name}`,
  tmp: (name: string) => `${prefix()}/tmp/${name}`,
};

class S3Storage implements Storage {
  readonly driver = "s3" as const;
  private client: S3Client;
  constructor(
    private bucket: string,
    region: string,
  ) {
    this.client = new S3Client({ region });
  }
  async put(key: string, body: Buffer | Uint8Array | string, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await r.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async signedUrl(key: string, seconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: seconds });
  }
}

class MemoryStorage implements Storage {
  readonly driver = "memory" as const;
  private files = new Map<string, { body: Buffer; type: string }>();
  async put(key: string, body: Buffer | Uint8Array | string, contentType: string) {
    this.files.set(key, { body: Buffer.from(body), type: contentType });
  }
  async get(key: string) {
    return this.files.get(key)?.body ?? null;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
  async signedUrl(key: string) {
    return `memory://${key}`;
  }
}

const g = globalThis as unknown as { __storage?: Storage };

export function storage(): Storage {
  if (g.__storage) return g.__storage;
  const driver = process.env.STORAGE_DRIVER ?? (process.env.S3_BUCKET ? "s3" : "memory");
  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET?.trim();
    const region = process.env.AWS_REGION?.trim();
    if (!bucket || !region) throw new Error("Faltan S3_BUCKET o AWS_REGION en .env");
    g.__storage = new S3Storage(bucket, region);
  } else {
    g.__storage = new MemoryStorage();
  }
  return g.__storage;
}
