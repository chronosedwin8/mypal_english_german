import { describe, expect, it } from "vitest";

import { billedSecondsFromDuration, computeReserve, costMicroUsd, formatClock } from "@/server/metering/billing-math";

describe("billedSecondsFromDuration", () => {
  it.each([
    [0, 30],
    [1, 30],
    [29_900, 30],
    [30_000, 30],
    [30_100, 36],
    [36_000, 36],
    [36_001, 42],
    [299_999, 300],
    [300_000, 300],
    [300_001, 306],
  ])("%i ms -> %i s", (ms, expected) => {
    expect(billedSecondsFromDuration(ms, true)).toBe(expected);
  });

  it("sin conversacion creada no se cobra nada", () => {
    expect(billedSecondsFromDuration(120_000, false)).toBe(0);
  });

  it("duraciones negativas o invalidas cobran el minimo", () => {
    expect(billedSecondsFromDuration(-5_000, true)).toBe(30);
    expect(billedSecondsFromDuration(Number.NaN, true)).toBe(30);
  });

  it("nunca cobra menos que el tiempo real (propiedad)", () => {
    for (let ms = 0; ms < 2_000_000; ms += 777) {
      expect(billedSecondsFromDuration(ms, true) * 1000).toBeGreaterThanOrEqual(ms);
    }
  });
});

describe("computeReserve", () => {
  const base = { tavusPlanMaxSeconds: 900, safetyMarginSeconds: 20, minStartSeconds: 60 };

  it("prueba gratis: cubo de 320 s -> clase de 5 min completos", () => {
    expect(computeReserve({ ...base, availableSeconds: 320, perSessionCapSeconds: 300 })).toEqual({
      ok: true,
      reserveSeconds: 320,
      maxCallDurationSeconds: 300,
    });
  });

  it("plan Fluido con saldo de sobra: 15 min completos", () => {
    expect(computeReserve({ ...base, availableSeconds: 3600, perSessionCapSeconds: 900 })).toEqual({
      ok: true,
      reserveSeconds: 920,
      maxCallDurationSeconds: 900,
    });
  });

  it("plan Basico: 10 min por clase", () => {
    const r = computeReserve({ ...base, availableSeconds: 1200, perSessionCapSeconds: 600 });
    expect(r).toEqual({ ok: true, reserveSeconds: 620, maxCallDurationSeconds: 600 });
  });

  it("el tope de Tavus manda sobre el del plan", () => {
    const r = computeReserve({ ...base, tavusPlanMaxSeconds: 600, availableSeconds: 3600, perSessionCapSeconds: 900 });
    expect(r).toEqual({ ok: true, reserveSeconds: 620, maxCallDurationSeconds: 600 });
  });

  it("si el saldo limita, la clase dura saldo - margen", () => {
    const r = computeReserve({ ...base, availableSeconds: 200, perSessionCapSeconds: 900 });
    expect(r).toEqual({ ok: true, reserveSeconds: 200, maxCallDurationSeconds: 180 });
  });

  it("saldo menor al minimo -> no se puede iniciar", () => {
    const r = computeReserve({ ...base, availableSeconds: 79, perSessionCapSeconds: 900 });
    expect(r.ok).toBe(false);
  });

  it("max_call_duration nunca supera la reserva ni los topes (propiedad)", () => {
    for (let avail = 0; avail < 2000; avail += 7) {
      for (const cap of [300, 600, 900]) {
        const r = computeReserve({ ...base, availableSeconds: avail, perSessionCapSeconds: cap });
        if (r.ok) {
          expect(r.reserveSeconds).toBeLessThanOrEqual(avail);
          expect(r.maxCallDurationSeconds + 20).toBe(r.reserveSeconds);
          expect(r.maxCallDurationSeconds).toBeLessThanOrEqual(Math.min(cap, 900));
        }
      }
    }
  });
});

describe("utilidades", () => {
  it("costo en micro-USD", () => {
    expect(costMicroUsd(60, 350_000)).toBe(350_000n);
    expect(costMicroUsd(300, 350_000)).toBe(1_750_000n);
  });

  it("formato de reloj", () => {
    expect(formatClock(245)).toBe("4:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
