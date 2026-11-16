export interface Stat { n: string; t: string; s: string }
export interface News { t: string; s: string }
export interface Story { h: string; t: string }

export interface Card {
  id: string; part: string; cat: string; name: string; title: string; sub: string;
  care: string[]; hello: string; stats: Stat[]; news: News[]; open: string[]; listen: string[];
  why: string; pitch: string; storiesTitle: string; stories: Story[];
  jargon: [string, string][]; obj: [string, string][]; follow: string[]; next: string; close: string;
}

export interface KbEntry { cat: string; t: string; s: string; b: string[]; say?: string; tags: string; card: string[] }

export interface Offer { brand: string; name: string; what: string; b: string[]; tags: string }

export interface QB {
  WARM: Record<string, string[]>;
  BIG: Record<string, string[]>;
  CARD: Record<string, { big: string; biz: string[]; deep: string[] }>;
  ROLE: Record<string, string[]>;
}

export interface Ref {
  guard: [string, string][];
  pitches: [string, string, string][];
  objs: [string, string][];
  closing: [string, string][];
  gloss: { t: string; items: [string, string][] }[];
  handoff: [string, string, string][];
}

/** [group, name, industry, what] */
export type Ent = [string, string, string, string];

export interface Content {
  cards: Card[];
  kb: KbEntry[];
  offers: { catalog: Record<string, Offer>; map: Record<string, [string, string][]> };
  qb: QB;
  desig: [string, string][];
  ref: Ref;
  ents: Ent[];
}

/** Answers the seller gives on Check / Choose the scenario. */
export interface Form {
  role?: string; industry?: string; interest?: string; ctype?: string; cloud?: string; pain?: string; size?: string;
  company?: string; website?: string; person?: string; designation?: string; notes?: string;
  knownCompany?: boolean;
}

export interface Ranked { id: string; score: number; reasons: string[] }

export interface ParsedCo { raw: string; display: string; domain: string; brand: string; tld: string }

export interface CompanyGuess {
  recognised: boolean; what: string; industry: string; security_vendor: boolean; type: string;
  confidence: "high" | "medium" | "low"; hq: string; sources: { url: string; title: string }[]; live: boolean;
}

export interface Report {
  recognised: boolean; confidence: string; about: string;
  facts: { k: string; v: string }[];
  products: { name: string; line: string }[];
  countries: { list: string[]; india: string };
  channels: { type: string; detail: string }[];
  infra: { cloud: string; detail: string; evidence: string[]; stack: string[]; ask: string };
  market: { tam: { v: string; n: string }; sam: { v: string; n: string }; som: { v: string; n: string }; year: string; basis: string };
  mandates: { name: string; why: string }[];
  signals: string[];
  fit: { id: string; why: string }[];
  openers: string[];
  caveats: string;
  sources?: { url: string; title: string }[];
}

export interface ReportResponse { company: string; report: Report; live: boolean; model: string; createdAt: string | null; cached: boolean }

export interface PhotoId {
  found: boolean; company: string; website: string; what: string; hq: string; industry: string; type: string;
  confidence: "high" | "medium" | "low"; logo: string; lines: string[]; sources: { url: string; title: string }[]; live: boolean;
}

export interface AppConfig { llm: boolean; webSearch: boolean; model: string; accessKey: boolean }
