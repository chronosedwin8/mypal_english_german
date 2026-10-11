import { FakeTavusClient } from "./fake-client";
import { HttpTavusClient } from "./http-client";
import type { TavusClient } from "./types";

export * from "./types";

let client: TavusClient | null = null;

/** TAVUS_DRIVER=http (Tavus real, cuesta minutos) | fake (simulador). */
export function tavus(): TavusClient {
  const driver = process.env.TAVUS_DRIVER === "http" ? "http" : "fake";
  if (!client || client.driver !== driver) {
    client = driver === "http" ? new HttpTavusClient() : new FakeTavusClient();
  }
  return client;
}
