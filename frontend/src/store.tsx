import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, isNotConfigured } from "./lib/api";
import { classify, IND, IND_LABEL, inferProduct, roleFromText, scoreCards, type ClassifyResult } from "./lib/engine";
import { buildFlow, type Beat, type Ctx } from "./lib/flow";
import { buildIndex, type IdxEntry } from "./lib/search";
import type { AppConfig, Card, CompanyGuess, Content, Ent, Form, ParsedCo, Ranked, ReportResponse } from "./lib/types";
import { addHist, parseCo } from "./lib/util";

export const VIEWS = ["start", "company", "check", "manual", "card", "all", "ref", "kb", "report"] as const;
export type View = (typeof VIEWS)[number];

export interface Sugg { l: string; set: Partial<Form> }
export interface AiState {
  ai: boolean; known?: boolean; live?: boolean; sources?: { url: string; title: string }[]; what?: string; conf?: string;
  recognised?: boolean; hq?: string; sugg: Sugg[]; sec?: boolean; error?: string; notConfigured?: boolean; picked?: Ent;
}
export type RepState = "pick" | "ask" | "loading" | "done" | "error";

export interface S {
  form: Form;
  co: ParsedCo | null;
  detect: ClassifyResult | null;
  checkReady: boolean;
  entKnown: boolean;
  ai: AiState | null;
  aiBusy: boolean;
  desc: string;
  card: Card | null;
  pg: number;
  ctx: Partial<Ctx>;
  extra: string[];
  rank: Ranked[];
  reasonsById: Record<string, string[]>;
  ticks: Record<string, boolean>;
  heard: Record<string, Record<number, boolean>>;
  notes: string;
  kb: IdxEntry | null;
  reps: Record<string, ReportResponse>;
  repFor: { company: string; domain: string } | null;
  repState: RepState;
  repError: string;
}

const INIT: S = {
  form: {}, co: null, detect: null, checkReady: false, entKnown: false, ai: null, aiBusy: false, desc: "",
  card: null, pg: 0, ctx: {}, extra: [], rank: [], reasonsById: {}, ticks: {}, heard: {}, notes: "", kb: null,
  reps: {}, repFor: null, repState: "ask", repError: "",
};

type Patch = Partial<S> | ((s: S) => Partial<S>);

interface Store {
  D: Content; IDX: IdxEntry[]; cfg: AppConfig; s: S; view: View; beats: Beat[];
  set: (p: Patch) => void;
  setForm: (p: Partial<Form>) => void;
  go: (v: View) => void;
  back: () => void;
  findCompany: (raw: string, website?: string) => void;
  pickEntity: (e: Ent) => void;
  runAnalysis: (desc: string) => void;
  serve: (manual?: boolean) => void;
  openCard: (id: string, pg?: number | null, fresh?: boolean, from?: string) => void;
  openEntry: (e: IdxEntry) => void;
  openReport: (company?: string, domain?: string) => void;
  startReport: (refresh: boolean) => void;
  resetAll: () => void;
}

const Ctx_ = createContext<Store | null>(null);
export function useStore(): Store { const v = useContext(Ctx_); if (!v) throw new Error("no store"); return v; }

export function repKey(company: string, domain: string) { return (domain || company).toLowerCase().trim(); }

function readHash(): View { const h = location.hash.replace("#", "") as View; return (VIEWS as readonly string[]).includes(h) ? h : "start"; }

export function StoreProvider({ D, cfg, children }: { D: Content; cfg: AppConfig; children: ReactNode }) {
  const [s, setS] = useState<S>(INIT);
  const ref = useRef(s); ref.current = s;
  const [hashView, setHashView] = useState<View>(readHash());
  const aiToken = useRef(0);
  const IDX = useMemo(() => buildIndex(D), [D]);
  const byId = useMemo(() => Object.fromEntries(D.cards.map((c) => [c.id, c])), [D]);

  const set = useCallback((p: Patch) => {
    setS((prev) => { const n = { ...prev, ...(typeof p === "function" ? p(prev) : p) }; ref.current = n; return n; });
  }, []);
  const setForm = useCallback((p: Partial<Form>) => set((x) => ({ form: { ...x.form, ...p } })), [set]);

  useEffect(() => {
    const on = () => { setHashView(readHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = useCallback((v: View) => {
    if (readHash() === v && location.hash) { setHashView(v); window.scrollTo(0, 0); }
    else location.hash = v;
  }, []);
  const back = useCallback(() => { if (history.length > 1) history.back(); else go("start"); }, [go]);

  // screens that need state fall back gracefully (for example after a reload)
  let view: View = hashView;
  if (view === "card" && !s.card) view = "start";
  if (view === "check" && !s.checkReady) view = "company";
  if (view === "kb" && !s.kb) view = "start";
  if (view === "report" && !s.repFor) view = "start";

  const beats = useMemo(() => (s.card ? buildFlow(D, s.card, s.ctx) : []), [D, s.card, s.ctx]);

  /* ---------- company lookup ---------- */
  function applyGuess(p: ParsedCo, j: CompanyGuess | null, desc: string, form: Form): { ai: AiState; form: Form } {
    // never auto-set "startup": credits are startup-only, so a startup read is offered as a tap to confirm
    const sugg: Sugg[] = [], inf = inferProduct((desc || "") + " " + p.brand + " " + p.domain), f = { ...form };
    const ai: AiState = { ai: false, what: "", conf: "low", sugg };
    if (j) {
      ai.ai = true; ai.live = !!j.live; ai.sources = j.sources || []; ai.what = String(j.what || "").slice(0, 280);
      ai.conf = /^(high|medium|low)$/.test(j.confidence) ? j.confidence : "low"; ai.recognised = !!j.recognised; ai.hq = j.hq || "";
      const strong = ai.conf !== "low";
      if (IND[j.industry]) { if (strong || !f.industry) f.industry = j.industry; }
      if (j.industry === "tech_product" || j.type === "isv") { if (strong) f.ctype = f.ctype || "isv"; else sugg.push({ l: "Software product company", set: { ctype: "isv" } }); }
      if (j.security_vendor) { if (!f.interest) f.interest = "security"; ai.sec = true; }
      if (/^(enterprise|mid|global|gov|investor|si)$/.test(j.type) && strong && !f.ctype) f.ctype = j.type;
      if (j.type === "startup" || inf.startup) sugg.push({ l: "Yes, it is a startup", set: { ctype: "startup" } });
    } else {
      if (inf.product || p.tld === "ai" || p.tld === "io") sugg.push({ l: "Software or AI product company", set: { ctype: "isv" } });
      if (inf.security) sugg.push({ l: "Security product company", set: { ctype: "isv", interest: "security" } });
      if (inf.startup) sugg.push({ l: "Yes, it is a startup", set: { ctype: "startup" } });
    }
    return { ai, form: f };
  }

  const runAnalysisFor = useCallback(async (p: ParsedCo, desc: string) => {
    const token = ++aiToken.current;
    set({ aiBusy: true, desc });
    let j: CompanyGuess | null = null, error = "", notConfigured = false;
    if (cfg.llm) {
      try { j = await api.companyCheck(p.display, p.domain, desc); }
      catch (e) { if (isNotConfigured(e)) notConfigured = true; else error = e instanceof ApiError ? e.message : "Lookup failed."; }
    } else notConfigured = true;
    if (token !== aiToken.current) return;
    const cur = ref.current;
    const form = { ...cur.form };
    if (desc) { const rr = classify(desc); if (rr.top && rr.top.score >= 4 && !form.industry) form.industry = rr.top.ind; }
    const g = applyGuess(p, j, desc, form);
    g.ai.error = error; g.ai.notConfigured = notConfigured;
    set({ aiBusy: false, ai: g.ai, form: g.form });
  }, [cfg.llm, set]);

  const findCompany = useCallback((raw: string, website?: string) => {
    raw = raw.trim(); if (!raw) return;
    const p = parseCo(raw); addHist(raw);
    const cur = ref.current;
    const form: Form = { ...cur.form, company: p.display, website: p.domain || website || "", industry: "", ctype: "", interest: "" };
    const r = classify(p.brand + " " + p.display);
    if (r.ambiguous.length < 2 && r.top) form.industry = r.top.ind;
    const known = r.known && !!r.top && r.ambiguous.length < 2;
    aiToken.current++;
    set({ co: p, desc: "", form, detect: r, checkReady: true, entKnown: false, ai: known ? { ai: true, known: true, sugg: [] } : null, aiBusy: false });
    go("check");
    if (!known) runAnalysisFor(p, "");
  }, [go, runAnalysisFor, set]);

  const pickEntity = useCallback((e: Ent) => {
    const [grp, name, ind, what] = e;
    addHist(name);
    const p = parseCo(name);
    const cur = ref.current;
    const industry = IND[ind] ? ind : "";
    const form: Form = { ...cur.form, company: name, website: "", industry, ctype: "", interest: "" };
    const detect: ClassifyResult = industry
      ? { list: [{ ind: industry, score: 10, why: [grp] }], top: { ind: industry, score: 10, why: [grp] }, ambiguous: [], known: true }
      : { list: [], top: null, ambiguous: [], known: true };
    aiToken.current++;
    set({ co: p, desc: "", form, detect, checkReady: true, entKnown: true, ai: { ai: true, known: true, sugg: [], what, picked: e }, aiBusy: false });
    go("check");
  }, [go, set]);

  const runAnalysis = useCallback((desc: string) => { const p = ref.current.co; if (p) runAnalysisFor(p, desc); }, [runAnalysisFor]);

  /* ---------- serve the battle card ---------- */
  const openCard = useCallback((id: string, pg?: number | null, fresh?: boolean, from?: string) => {
    const card = byId[id]; if (!card) return;
    set(() => ({
      card, pg: pg != null ? pg : 0,
      ...(fresh ? { notes: "", heard: {}, ticks: {} } : {}),
      ...(from ? { ctx: {}, rank: [], reasonsById: {}, extra: [from] } : {}),
    }));
  }, [byId, set]);

  const serve = useCallback((manual = false) => {
    const cur = ref.current;
    const f: Form = { ...cur.form };
    if (f.industry === "none") f.industry = "";
    const reasons: string[] = [];
    if (!f.industry && (f.company || f.website)) {
      const r = classify((f.company || "") + " " + (f.website || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.[a-z.]+(\/.*)?$/, "").replace(/[-_.]/g, " "));
      if (r.top && r.ambiguous.length < 2) { f.industry = r.top.ind; reasons.push("Company or website matched " + IND_LABEL[r.top.ind]); }
    }
    if (f.company && f.industry) { const cc = classify(f.company); if (cc.top && cc.top.ind === f.industry && !reasons.length) reasons.push("Company “" + f.company + "” matched to " + IND_LABEL[f.industry]); }
    if (f.company && (classify(f.company).known || (!manual && cur.entKnown))) f.knownCompany = true;
    const res = scoreCards(f);
    res.notes.forEach((n) => reasons.push(n));
    if (f.knownCompany && res.nonStartup) reasons.push("Established company: no AWS credits");
    const reasonsById: Record<string, string[]> = {};
    res.ranked.forEach((x) => { reasonsById[x.id] = x.reasons; });
    set({
      ctx: { company: f.company || "", person: f.person || "", designation: f.designation || "", website: f.website || "", notes: f.notes || "", role: f.role || roleFromText(f.designation || "") },
      extra: reasons, rank: res.ranked, reasonsById, card: byId[res.primary.id], pg: 0, notes: "", heard: {}, ticks: {},
    });
    go("card");
  }, [byId, go, set]);

  const openEntry = useCallback((e: IdxEntry) => {
    if (e.k === "card" && e.id) { openCard(e.id, null, true, "Opened from search"); go("card"); return; }
    set({ kb: e }); go("kb");
  }, [go, openCard, set]);

  /* ---------- Market Insight Report (only after the seller confirms) ---------- */
  const openReport = useCallback((companyIn?: string, domainIn?: string) => {
    const cur = ref.current;
    const company = (companyIn ?? (cur.form.company || cur.ctx.company || "")).trim();
    const domain = companyIn != null ? domainIn || "" : cur.form.website || cur.ctx.website || "";
    if (!company) { set({ repFor: { company: "", domain: "" }, repState: "pick", repError: "" }); go("report"); return; }
    const k = repKey(company, domain);
    if (cur.reps[k]) { set({ repFor: { company, domain }, repState: "done", repError: "" }); go("report"); return; }
    set({ repFor: { company, domain }, repState: "ask", repError: "" });
    go("report");
    // a report already saved on the server costs no tokens; show it if there is one
    api.cachedReport(company, domain, cur.form.ctype === "startup").then((r) => {
      if (!r.found || ref.current.repFor?.company !== company || ref.current.repState !== "ask") return;
      set((x) => ({ reps: { ...x.reps, [k]: r }, repState: "done" }));
    }).catch(() => { /* none cached: stay on the confirm step */ });
  }, [go, set]);

  const startReport = useCallback(async (refresh: boolean) => {
    const cur = ref.current; if (!cur.repFor) return;
    const { company, domain } = cur.repFor, k = repKey(company, domain);
    set({ repState: "loading", repError: "" });
    const f = cur.form;
    const ctx: Record<string, string> = {};
    if (f.industry && IND_LABEL[f.industry]) ctx.industry = IND_LABEL[f.industry];
    if (f.ctype) ctx.type = f.ctype;
    if (f.designation) ctx.designation = f.designation;
    if (cur.ai?.what) ctx.what = cur.ai.what;
    try {
      const r = await api.buildReport({ company, domain, startupConfirmed: f.ctype === "startup", refresh, ctx });
      if (ref.current.repFor?.company !== company) return;
      set((x) => ({ reps: { ...x.reps, [k]: r }, repState: "done" }));
    } catch (e) {
      const msg = isNotConfigured(e)
        ? "The AI service is not set up yet, so the report cannot be built. An administrator needs to add the Gemini API key on the server."
        : e instanceof ApiError ? e.message : "Something went wrong.";
      set({ repState: "error", repError: msg });
    }
  }, [set]);

  const resetAll = useCallback(() => {
    aiToken.current++;
    set((x) => ({ ...INIT, reps: x.reps }));
  }, [set]);

  const value: Store = { D, IDX, cfg, s, view, beats, set, setForm, go, back, findCompany, pickEntity, runAnalysis, serve, openCard, openEntry, openReport, startReport, resetAll };
  return <Ctx_.Provider value={value}>{children}</Ctx_.Provider>;
}
