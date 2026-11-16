/* Photo reading: the browser's TextDetector, then Gemini vision via the API, then Tesseract.js
   loaded from a CDN on first use (self-host it if outside access is blocked). */
import { api } from "./api";
import { classify } from "./engine";
import { withTimeout } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { TextDetector?: any; Tesseract?: any } }

export function toCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; url: string }> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const L = Math.max(img.width, img.height), sc = L > 1800 ? 1800 / L : L < 900 ? 900 / L : 1, cv = document.createElement("canvas");
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height); res({ canvas: cv, url });
    };
    img.onerror = () => rej(new Error("image")); img.src = url;
  });
}

// greyscale + stretched contrast, optionally inverted: helps white-on-colour boards and glare
function prep(src: HTMLCanvasElement, invert: boolean) {
  const cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d")!; ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
  let lo = 255, hi = 0, i, g;
  for (i = 0; i < d.length; i += 4) { g = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0; d[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
  const span = Math.max(40, hi - lo);
  for (i = 0; i < d.length; i += 4) { g = Math.max(0, Math.min(255, ((d[i] - lo) * 255 / span) | 0)); if (invert) g = 255 - g; d[i] = d[i + 1] = d[i + 2] = g; }
  ctx.putImageData(im, 0, 0); return cv;
}

export function cleanLines(arr: string[]): string[] {
  const seen: Record<string, 1> = {}, out: string[] = [];
  arr.forEach((raw) => {
    const l = String(raw).replace(/[\r\t]+/g, " ").replace(/[|_~=<>{}[\]\\/*]+/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–•.:,;]+|[\s\-–•.:,;]+$/g, "");
    if (l.length < 3 || !/[A-Za-z]{3,}/.test(l)) return;
    const k = l.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(l);
  });
  return out.slice(0, 14);
}

async function viaDetector(canvas: HTMLCanvasElement) {
  if (!window.TextDetector) return null;
  try { const res = await new window.TextDetector().detect(canvas); const l = cleanLines(res.map((x: any) => x.rawValue)); return l.length ? l : null; } catch { return null; }
}

async function viaServer(canvas: HTMLCanvasElement) {
  try {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return null;
    const out = await api.ocr(blob);
    const l = cleanLines(out.lines || []);
    return l.length ? l : null;
  } catch { return null; }
}

function loadScript(src: string) {
  return new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("script")); document.head.appendChild(s); });
}

async function viaTesseract(canvas: HTMLCanvasElement, say: (m: string) => void) {
  try {
    say("Reading the photo. The first read can take up to a minute.");
    if (!window.Tesseract) await withTimeout(loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"), 15000);
    const worker = await withTimeout(window.Tesseract.createWorker("eng", 1, { langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int" }), 45000) as any;
    let all: string[] = [];
    try { await worker.setParameters({ tessedit_pageseg_mode: "11" }); } catch { /* older build */ }
    for (let v = 0; v < 2; v++) {
      const out = await withTimeout(worker.recognize(prep(canvas, v === 1)), 45000) as any;
      all = all.concat(String((out.data && out.data.text) || "").split("\n"));
    }
    try { await worker.terminate(); } catch { /* ignore */ }
    const l = cleanLines(all); return l.length ? l : null;
  } catch { return null; }
}

export function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
}

export async function readText(canvas: HTMLCanvasElement, say: (m: string) => void, aiOn: boolean): Promise<string[] | null> {
  say("Reading the photo…");
  return (await viaDetector(canvas)) || (aiOn ? await viaServer(canvas) : null) || (await viaTesseract(canvas, say));
}

export function bestLine(lines: string[]): string {
  let best = lines[0], bestScore = -1;
  lines.forEach((l) => { const r = classify(l), sc = r.top ? r.top.score : 0; if (sc > bestScore) { bestScore = sc; best = l; } });
  return bestScore > 0 ? best : lines[0];
}
