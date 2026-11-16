/* One search box over everything VHumans knows (cards, KB, offers, objections, facts, pitches,
   hand-offs) plus the entity directory for company stems such as "HDFC". */
import type { Content, Ent } from "./types";

export interface IdxEntry {
  i: number; k: string; t: string; s: string; b: string[]; say: string; card: string[]; tg: string; tl: string; bd: string; id?: string;
}

export const CATLAB: Record<string, string> = { OFF: "What we offer", SEC: "AI security", THR: "Threat", DEF: "Definition", AWS: "AWS", ORG: "About us", PLAY: "Playbook", card: "Battle card", obj: "Pushback", fact: "Fact", q: "Questions", pitch: "Pitch", hand: "Who to call" };
export const CATCOL: Record<string, string> = { OFF: "#6A38D8", SEC: "#6A38D8", THR: "#B3261E", DEF: "#4A2AA0", AWS: "#148A78", ORG: "#D946A8", PLAY: "#D946A8", card: "#1E1747", obj: "#6A38D8", fact: "#5A5080", q: "#C98A1B", pitch: "#4A2AA0", hand: "#5A5080" };
const WGT: Record<string, number> = { SEC: 1.4, THR: 1.25, DEF: 1.2, AWS: 1.3, ORG: 1.1, PLAY: 1.1, OFF: 1.3, card: 1.0, obj: 0.9, fact: 0.75, q: 0.7, pitch: 1.0, hand: 0.8 };
const STOP = ["the", "a", "an", "of", "is", "are", "what", "how", "to", "do", "we", "about", "for", "and", "in", "on", "with", "your", "you", "i", "me", "it", "does", "can", "tell", "us", "our", "my", "be", "or", "whats", "who", "why"];
const SYN: Record<string, string[]> = { copilot: ["vendor", "saas", "embedded"], agentforce: ["vendor", "saas", "embedded"], salesforce: ["vendor", "saas"], servicenow: ["vendor", "saas"], chatgpt: ["shadow", "unapproved"], gemini: ["shadow"], dlp: ["shadow", "leakage"], leak: ["leakage"], jailbreak: ["prompt", "injection"], pentest: ["red", "team"], pen: ["red", "team"], credit: ["credits", "activate"], credits: ["activate", "startups"], funding: ["map", "credits"], fund: ["map", "credits"], migrate: ["migration", "map"], cosell: ["co-sell"], pdm: ["co-sell", "partner"], rbi: ["governance", "bfsi"], dpdp: ["data", "protection"], gdpr: ["dpdp"], iso: ["governance", "framework"], mcp: ["tool", "poisoning"], skills: ["mcp", "tool"], nhi: ["identity", "non-human"], iam: ["identity"], secrets: ["keys", "identity"], bedrock: ["agentcore"], accelerator: ["generative", "startup"], price: ["pricing", "quote"], pricing: ["quote", "price"], budget: ["cost", "price"], hr: ["chro", "people"], jobs: ["hiring", "job"], press: ["media", "analyst"], si: ["incumbent", "vendor"], lock: ["lock-in"], hallucination: ["rag"], kill: ["stop", "switch"], audit: ["evidence", "governance"], offer: ["offer"], offers: ["offer"] };

export function buildIndex(D: Content): IdxEntry[] {
  const IDX: IdxEntry[] = [];
  const add = (k: string, t: string, s: string, b: string[] = [], say = "", card: string[] = [], tags = ""): IdxEntry => {
    const e: IdxEntry = { i: IDX.length, k, t, s: s || "", b: b || [], say: say || "", card: card || [], tg: String(tags || "").toLowerCase(), tl: "", bd: "" };
    e.tl = String(t).toLowerCase(); e.bd = (e.s + " " + e.b.join(" ") + " " + e.say).toLowerCase();
    IDX.push(e); return e;
  };
  // the KB already carries one OFF entry per offer (generated from offers.catalog)
  D.kb.forEach((e) => add(e.cat, e.t, e.s, e.b, e.say, e.card, e.tags));
  D.cards.forEach((c) => {
    const e = add("card", c.name, c.title, [], "", [c.id], c.cat + " " + c.stories.map((x) => x.h).join(" ") + " " + c.jargon.map((j) => j[0]).join(" ") + " " + c.sub);
    e.id = c.id;
    const q = D.qb.CARD[c.id];
    add("q", "Questions to ask: " + c.name, c.open[0], c.open.concat(q ? q.biz.concat(q.deep) : []), "", [c.id], "questions ask discovery conversation " + c.name);
    c.obj.forEach((o) => add("obj", o[0], o[1], [], "", [c.id], c.name));
    c.stats.forEach((x) => add("fact", x.t, x.n + " · " + x.s, [], "", [c.id], c.name));
    c.news.forEach((n) => add("fact", n.t, n.s, [], "", [c.id], c.name + " news"));
  });
  const seen: Record<string, IdxEntry> = {};
  D.cards.forEach((c) => c.jargon.forEach((j) => {
    const k = j[0].toLowerCase();
    if (seen[k]) { if (seen[k].card.indexOf(c.id) < 0) seen[k].card.push(c.id); return; }
    seen[k] = add("DEF", j[0], j[1], [], "", [c.id], "jargon term meaning " + j[0]);
  }));
  (D.ref.gloss || []).forEach((g) => g.items.forEach((j) => { const k = j[0].toLowerCase(); if (seen[k]) return; seen[k] = add("DEF", j[0], j[1], [], "", [], "glossary term meaning"); }));
  (D.ref.objs || []).forEach((o) => add("obj", o[0], o[1], [], "", [], "objection pushback"));
  (D.ref.pitches || []).forEach((p) => add("pitch", "Pitch: " + p[0], p[1], [p[2]], "", [], "elevator pitch 10 seconds 30 seconds say"));
  (D.ref.handoff || []).forEach((p) => add("hand", p[0], p[1], ["Send them: " + p[2]], "", [], "hand-off owner who to bring in escalate"));
  return IDX;
}

function escRe(x: string) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function wordIn(hay: string, w: string) { return new RegExp("(^|[^a-z0-9])" + escRe(w)).test(hay); }

export function search(IDX: IdxEntry[], q: string): { e: IdxEntry; sc: number }[] {
  const toks = (q.toLowerCase().match(/[a-z0-9\-.]+/g) || []).filter((w) => w.length > 1 && STOP.indexOf(w) < 0);
  if (!toks.length) return [];
  let extra: string[] = []; toks.forEach((w) => { if (SYN[w]) extra = extra.concat(SYN[w]); });
  const phrase = toks.join(" "), out: { e: IdxEntry; sc: number }[] = [];
  IDX.forEach((e) => {
    let sc = 0, hit = 0;
    toks.forEach((w) => {
      const a = wordIn(e.tl, w) ? 6 : e.tl.indexOf(w) > -1 ? 3 : 0, b = e.tg.indexOf(w) > -1 ? 3 : 0, c = e.bd.indexOf(w) > -1 ? 1.2 : 0, t = a + b + c;
      if (t > 0) hit++; sc += t;
    });
    extra.forEach((w) => { if (e.tl.indexOf(w) > -1) sc += 1.5; else if (e.tg.indexOf(w) > -1) sc += 1; });
    if (toks.length > 1) { if (e.tl.indexOf(phrase) > -1) sc += 8; if (hit === toks.length) sc += 4; else if (hit < toks.length / 2) sc *= 0.5; }
    if (sc > 0) out.push({ e, sc: sc * (WGT[e.k] || 1) });
  });
  out.sort((a, b) => b.sc - a.sc);
  return out;
}

/** Known entities whose group or name starts with, or contains, the typed text. */
export function entMatches(ents: Ent[], q: string, max = 12): Ent[] {
  const ql = q.trim().toLowerCase();
  if (ql.length < 2) return [];
  const scored: { e: Ent; s: number }[] = [];
  ents.forEach((e) => {
    const g = e[0].toLowerCase(), n = e[1].toLowerCase();
    let s = 0;
    if (n === ql) s = 10;
    else if (g === ql) s = 8;
    else if (n.startsWith(ql) || g.startsWith(ql)) s = 6;
    else if (new RegExp("(^|[^a-z0-9])" + escRe(ql)).test(n)) s = 4;
    else if (ql.length >= 3 && n.indexOf(ql) > -1) s = 2;
    if (s) scored.push({ e, s });
  });
  return scored.sort((a, b) => b.s - a.s || a.e[1].localeCompare(b.e[1])).slice(0, max).map((x) => x.e);
}

export function looksLikeUrl(q: string): boolean { return /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(q.trim()); }
