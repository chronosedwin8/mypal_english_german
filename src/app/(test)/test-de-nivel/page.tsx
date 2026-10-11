import type { Metadata } from "next";

import { DiagnosticRunner } from "@/components/diagnostic/diagnostic-runner";

export const metadata: Metadata = {
  title: "Test de nivel gratis",
  description: "Descubre tu nivel de inglés o alemán en unos minutos. Gratis y sin registro.",
};

export default function DiagnosticPage() {
  return <DiagnosticRunner />;
}
