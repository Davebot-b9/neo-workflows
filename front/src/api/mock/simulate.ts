import type { AnswerPayload, Question } from "../types";

// Inferencia de juguete para el modo demo: determinista (mismo texto → misma
// respuesta) y sensible al contenido, para que la demo muestre las tres rutas
// de la cascada según lo que escribas. No pretende parecerse al modelo real.

const URGENCY_STEMS = ["urgen", "inmed", "hoy", "venc", "plazo", "criti", "prior", "asap", "ya"];

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word.replace(/s$/, "");
}

export function stems(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length > 1)
      .map(stem),
  );
}

/** PRNG determinista (mulberry32) sembrado con el hash del texto. */
export function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function hits(words: Set<string>, keywords: Iterable<string>): number {
  let count = 0;
  for (const k of keywords) if (k.length > 2 && words.has(k)) count++;
  return count;
}

export function simulateAnswer(question: Question, text: string, rand: () => number): AnswerPayload {
  const words = stems(text);

  if (question.type === "choice" && question.criteria && Object.keys(question.criteria).length > 0) {
    const options = Object.keys(question.criteria);
    const logits = options.map((option) => {
      const keywords = stems(`${option} ${question.criteria?.[option] ?? ""}`);
      return hits(words, keywords) * 1.9 + rand() * 0.6;
    });
    const probs = softmax(logits);
    const best = probs.indexOf(Math.max(...probs));
    const probabilities = Object.fromEntries(options.map((o, i) => [o, round(probs[i])]));
    return { type: "choice", choice: options[best], probabilities, confidence: round(probs[best]) };
  }

  if (question.type === "noul") {
    const found = hits(words, URGENCY_STEMS) + hits(words, stems(question.instructions)) * 0.25;
    const p = found > 0 ? Math.min(0.97, 0.74 + found * 0.07 + rand() * 0.05) : 0.12 + rand() * 0.22;
    // Forma real de System One: noul solo trae P(verdadero), sin confidence propio.
    return { type: "noul", noul: round(p) };
  }

  // score: distribución sobre niveles ordenados; el valor es la esperanza normalizada a [0,1].
  const levels = question.score_levels?.length ? question.score_levels : ["bajo", "medio", "alto"];
  const intensity = hits(words, URGENCY_STEMS);
  const probs = softmax(levels.map((_, i) => -Math.abs(i - Math.min(levels.length - 1, intensity)) * 1.6 + rand() * 0.5));
  const score = probs.reduce((sum, p, i) => sum + p * i, 0) / Math.max(1, levels.length - 1);
  return {
    type: "score",
    score: round(score),
    legend: Object.fromEntries(levels.map((label, i) => [String(i), label])),
    probabilities: Object.fromEntries(levels.map((label, i) => [label, round(probs[i])])),
    confidence: round(Math.max(...probs)),
  };
}
