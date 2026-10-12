/**
 * Calificacion de preguntas objetivas (Listening, Reading, Lesen, Horen).
 * Las respuestas abiertas se normalizan como en el examen: mayusculas, ortografia
 * britanica o americana, numeros en cifras o letras. Pasarse del limite de palabras
 * o escribir mal la palabra cuenta como error.
 */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

/** Pares britanico → americano que las reglas generales no cubren. */
const SPELLING: Record<string, string> = {
  grey: "gray",
  programme: "program",
  programmes: "programs",
  cheque: "check",
  tyre: "tire",
  tyres: "tires",
  aluminium: "aluminum",
  jewellery: "jewelry",
  storey: "story",
  mould: "mold",
  plough: "plow",
  enrol: "enroll",
  enrolment: "enrollment",
  fulfil: "fulfill",
  defence: "defense",
  licence: "license",
  offence: "offense",
  practise: "practice",
  analyse: "analyze",
  paralyse: "paralyze",
  ageing: "aging",
  judgement: "judgment",
  manoeuvre: "maneuver",
  oestrogen: "estrogen",
  paediatric: "pediatric",
  encyclopaedia: "encyclopedia",
};

/** Lleva una palabra a su forma americana (se aplica igual a la clave y a la respuesta). */
function canonicalWord(w: string): string {
  if (SPELLING[w]) return SPELLING[w];
  if (w.length > 5) {
    if (w.endsWith("isation")) return `${w.slice(0, -7)}ization`;
    if (w.endsWith("isations")) return `${w.slice(0, -8)}izations`;
    if (/(ise|ised|ises|ising)$/.test(w)) w = w.replace(/is(e|ed|es|ing)$/, "iz$1");
    if (/(our|ours|oured)$/.test(w)) w = w.replace(/our(s|ed)?$/, "or$1");
    if (/(elled|elling|eller)$/.test(w)) w = w.replace(/ell(ed|ing|er)$/, "el$1");
  }
  if (/(tre|tres)$/.test(w) && w.length > 4) w = w.replace(/tre(s)?$/, "ter$1");
  if (/(ogue|ogues)$/.test(w) && w.length > 6) w = w.replace(/ogue(s)?$/, "og$1");
  return w;
}

/** "twenty-five" → "25"; "one hundred" → "100". Solo numeros simples. */
function wordsToNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const hy = t.split("-");
    if (hy.length === 2 && NUMBER_WORDS[hy[0]] !== undefined && NUMBER_WORDS[hy[1]] !== undefined) {
      out.push(String(NUMBER_WORDS[hy[0]] + NUMBER_WORDS[hy[1]]));
      i++;
      continue;
    }
    if (NUMBER_WORDS[t] !== undefined) {
      let value = NUMBER_WORDS[t];
      // "twenty five" → 25
      const unit = NUMBER_WORDS[tokens[i + 1]];
      if (value >= 20 && value % 10 === 0 && unit !== undefined && unit > 0 && unit < 10) {
        value += unit;
        i++;
      }
      if (tokens[i + 1] === "hundred") {
        value *= 100;
        i++;
      } else if (tokens[i + 1] === "thousand") {
        value *= 1000;
        i++;
      }
      out.push(String(value));
      i++;
      continue;
    }
    if ((t === "hundred" || t === "thousand") && (out.length === 0 || !/^\d+$/.test(out[out.length - 1]))) {
      out.push(t === "hundred" ? "100" : "1000");
      i++;
      continue;
    }
    out.push(t);
    i++;
  }
  return out;
}

export function normalizeAnswer(raw: string): string {
  let s = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
  // separadores de miles: 1,000 → 1000
  s = s.replace(/(\d),(\d{3})\b/g, "$1$2");
  // "0161 496 0732" → "01614960732": grupos separados SOLO por espacios son un numero
  // (no se unen numeros de oraciones o lineas distintas).
  s = s.replace(/(\d)[ \t]+(?=\d)/g, "$1");
  // puntuacion fuera de las palabras (se conservan ' - . : / dentro)
  s = s.replace(/[^\p{L}\p{N}'\-.:/%$£€\s]/gu, " ").replace(/(^|\s)[.:'\-/]+|[.:'\-/]+(?=\s|$)/g, " ");
  let tokens = s.split(/\s+/).filter(Boolean);
  tokens = wordsToNumbers(tokens).map(canonicalWord);
  // el articulo inicial no cambia la respuesta: "(the) museum"
  if (tokens.length > 1 && ["the", "a", "an"].includes(tokens[0])) tokens = tokens.slice(1);
  return tokens.join(" ");
}

/** Palabras segun IELTS: una palabra con guion cuenta como una; un numero cuenta como uno. */
export function countWords(s: string): number {
  let n = 0;
  let prevNumber = false;
  for (const w of s.trim().split(/\s+/)) {
    if (!/[\p{L}\p{N}]/u.test(w)) continue;
    const isNumber = /^[\d.,:/]+$/.test(w);
    if (!(isNumber && prevNumber)) n++;
    prevNumber = isNumber;
  }
  return n;
}

export function isObjectiveCorrect(given: string, accepted: string[], wordLimit?: number | null): boolean {
  if (!given.trim()) return false;
  if (wordLimit && countWords(given) > wordLimit) return false;
  const g = normalizeAnswer(given);
  return accepted.some((a) => normalizeAnswer(a) === g);
}

/** ¿El texto contiene la frase (normalizada, con limites de palabra)? */
export function textContains(haystack: string, needle: string): boolean {
  const h = ` ${normalizeAnswer(haystack)} `;
  const n = normalizeAnswer(needle);
  if (!n) return false;
  return h.includes(` ${n} `);
}

/** Posicion (en palabras normalizadas) donde aparece la frase, o -1. */
export function positionOf(haystack: string, needle: string): number {
  const h = ` ${normalizeAnswer(haystack)} `;
  const n = normalizeAnswer(needle);
  const at = n ? h.indexOf(` ${n} `) : -1;
  return at < 0 ? -1 : h.slice(0, at).split(" ").filter(Boolean).length;
}

/**
 * La respuesta del resolutor contiene la clave (o al reves) con palabras de mas o de
 * menos, esta literal en el texto y respeta el limite: es una variante valida.
 */
export function isOptionalWordsVariant(given: string, key: string, source: string, wordLimit: number | null): boolean {
  const g = normalizeAnswer(given);
  const k = normalizeAnswer(key);
  if (!g || !k || g === k) return false;
  if (wordLimit && countWords(given) > wordLimit) return false;
  const contains = ` ${g} `.includes(` ${k} `) || ` ${k} `.includes(` ${g} `);
  return contains && textContains(source, given);
}
