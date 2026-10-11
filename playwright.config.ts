import { defineConfig } from "@playwright/test";

/**
 * E2E con Tavus y pagos SIMULADOS (TAVUS_DRIVER=fake, PAYMENT_DRIVER=fake): costo $0.
 * Requiere Postgres local y usa el Chrome instalado (sin descargar navegadores).
 *   pnpm e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    viewport: { width: 1280, height: 860 },
    permissions: ["camera", "microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { TAVUS_DRIVER: "fake", PAYMENT_DRIVER: "fake" },
    },
    {
      command: "pnpm worker",
      reuseExistingServer: true,
      // El worker no expone puerto: se considera listo al arrancar.
      url: "http://localhost:3000",
      env: { TAVUS_DRIVER: "fake" },
    },
  ],
});
