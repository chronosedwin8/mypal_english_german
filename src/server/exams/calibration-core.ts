/**
 * Calibracion con uso real (puro, sin base de datos).
 *
 * - Rasch (1PL) por maxima verosimilitud conjunta (con la correccion (L−1)/L): dificultad
 *   de cada pregunta en logits, centrada en 0 por examen. Las personas o preguntas con todo correcto o todo incorrecto
 *   se acotan con media respuesta de correccion para que el estimador no diverja.
 * - Discriminacion punto-biserial: correlacion entre acertar la pregunta y el resto de la prueba.
 * - Equiparacion de formas: los cortes de la tabla base corresponden a una forma de dificultad
 *   media (b = 0). Para cada corte se busca la habilidad θ que da ese puntaje en la forma media
 *   y se calcula el puntaje esperado con las dificultades reales de la forma.
 */

export interface Observation {
  person: string;
  item: string;
  correct: boolean;
}

export interface RaschResult {
  difficulty: Map<string, number>;
  ability: Map<string, number>;
  iterations: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function rasch(obs: Observation[], opts: { maxIter?: number; tol?: number } = {}): RaschResult {
  const maxIter = opts.maxIter ?? 100;
  const tol = opts.tol ?? 1e-4;
  const byPerson = new Map<string, { item: string; x: number }[]>();
  const byItem = new Map<string, { person: string; x: number }[]>();
  for (const o of obs) {
    const x = o.correct ? 1 : 0;
    (byPerson.get(o.person) ?? byPerson.set(o.person, []).get(o.person)!).push({ item: o.item, x });
    (byItem.get(o.item) ?? byItem.set(o.item, []).get(o.item)!).push({ person: o.person, x });
  }
  // Puntajes acotados: [0.5, n − 0.5] evita estimaciones infinitas.
  const bounded = (sum: number, n: number) => clamp(sum, 0.5, n - 0.5);
  const ability = new Map<string, number>();
  const difficulty = new Map<string, number>();
  for (const [p, rs] of byPerson) {
    const s = bounded(rs.reduce((a, r) => a + r.x, 0), rs.length);
    ability.set(p, Math.log(s / (rs.length - s)));
  }
  for (const [i, rs] of byItem) {
    const s = bounded(rs.reduce((a, r) => a + r.x, 0), rs.length);
    difficulty.set(i, Math.log((rs.length - s) / s));
  }

  let it = 0;
  for (; it < maxIter; it++) {
    let delta = 0;
    for (const [i, rs] of byItem) {
      const b = difficulty.get(i)!;
      let expected = 0;
      let info = 0;
      for (const r of rs) {
        const p = sigmoid(ability.get(r.person)! - b);
        expected += p;
        info += p * (1 - p);
      }
      const observed = bounded(rs.reduce((a, r) => a + r.x, 0), rs.length);
      const step = clamp((expected - observed) / Math.max(info, 1e-6), -1, 1);
      difficulty.set(i, b + step);
      delta = Math.max(delta, Math.abs(step));
    }
    // Centrar: la media de las dificultades es 0 (identifica la escala).
    const mean = [...difficulty.values()].reduce((a, b) => a + b, 0) / Math.max(difficulty.size, 1);
    for (const [i, b] of difficulty) difficulty.set(i, b - mean);
    for (const [p, rs] of byPerson) {
      const t = ability.get(p)!;
      let expected = 0;
      let info = 0;
      for (const r of rs) {
        const q = sigmoid(t - difficulty.get(r.item)!);
        expected += q;
        info += q * (1 - q);
      }
      const observed = bounded(rs.reduce((a, r) => a + r.x, 0), rs.length);
      const step = clamp((observed - expected) / Math.max(info, 1e-6), -1, 1);
      ability.set(p, t + step);
      delta = Math.max(delta, Math.abs(step));
    }
    if (delta < tol) break;
  }
  // Correccion clasica del sesgo de JMLE: las dificultades salen infladas por L/(L−1).
  const avgLen = obs.length / Math.max(byPerson.size, 1);
  if (avgLen > 1) for (const [i, b] of difficulty) difficulty.set(i, (b * (avgLen - 1)) / avgLen);
  return { difficulty, ability, iterations: it + 1 };
}

/** Correlacion punto-biserial de cada pregunta con el puntaje del resto de la prueba (por persona). */
export function pointBiserial(obs: Observation[]): Map<string, number | null> {
  const total = new Map<string, { sum: number; n: number }>();
  for (const o of obs) {
    const t = total.get(o.person) ?? { sum: 0, n: 0 };
    t.sum += o.correct ? 1 : 0;
    t.n++;
    total.set(o.person, t);
  }
  const byItem = new Map<string, Observation[]>();
  for (const o of obs) (byItem.get(o.item) ?? byItem.set(o.item, []).get(o.item)!).push(o);
  const out = new Map<string, number | null>();
  for (const [item, rs] of byItem) {
    // Proporcion de aciertos en el resto (sin la propia pregunta), para comparar pruebas de distinto largo.
    const pairs = rs
      .map((r) => {
        const t = total.get(r.person)!;
        return t.n > 1 ? { x: r.correct ? 1 : 0, y: (t.sum - (r.correct ? 1 : 0)) / (t.n - 1) } : null;
      })
      .filter((v): v is { x: number; y: number } => v !== null);
    out.set(item, correlation(pairs));
  }
  return out;
}

function correlation(pairs: { x: number; y: number }[]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, p) => a + p.x, 0) / n;
  const my = pairs.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pairs) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export interface ItemCheck {
  n: number;
  pCorrect: number;
  discrimination: number | null;
}

/** Defectuosa: con suficientes respuestas, casi nadie la acierta o los buenos la fallan tanto como los demas. */
export function isDefective(s: ItemCheck, opts: { minResponses: number; minDiscrimination: number; minPCorrect: number }): boolean {
  if (s.n < opts.minResponses) return false;
  if (s.pCorrect < opts.minPCorrect) return true;
  return s.discrimination !== null && s.discrimination < opts.minDiscrimination;
}

/**
 * Tabla de conversion de una forma a partir de la tabla base (aciertos minimos sobre `rawMax`)
 * y las dificultades de sus preguntas. Devuelve cortes monotonos dentro de [1, rawMax].
 */
export function equateTable(base: [number, number][], difficulties: number[], rawMax = 40): [number, number][] {
  const n = difficulties.length;
  if (!n) return base;
  const out: [number, number][] = [];
  let prev = rawMax + 1;
  for (const [min, band] of base) {
    // θ que da `min` aciertos en una forma media de `rawMax` preguntas (b = 0).
    const theta = Math.log(clamp(min, 0.5, rawMax - 0.5) / (rawMax - clamp(min, 0.5, rawMax - 0.5)));
    const expected = (difficulties.reduce((a, b) => a + sigmoid(theta - b), 0) * rawMax) / n;
    const cut = clamp(Math.round(expected), 1, Math.min(rawMax, prev - 1 >= 1 ? prev - 1 : 1));
    out.push([cut, band]);
    prev = cut;
  }
  return out;
}
