import type { ParsedCo } from "./types";

export const OPT: Record<string, [string, string][]> = {
  role: [["ceo", "CEO, MD or founder"], ["cio", "CIO, CTO, head of IT or GCC head"], ["ciso", "CISO, head of security or risk"], ["cfo", "CFO or head of finance"], ["coo", "COO, operations or business head"], ["chro", "CHRO or HR leader"], ["cx", "Customer experience or contact-centre head"], ["sales", "Sales, marketing or product leader"], ["investor", "Investor, accelerator or incubator"], ["aws", "AWS or partner colleague"], ["other", "Other"]],
  industry: [["healthcare", "Healthcare and hospitals"], ["manufacturing", "Manufacturing"], ["itites", "IT, ITES and BPM"], ["bfsi", "Banking, finance and insurance"], ["retail", "Retail and D2C"], ["auto", "Automotive"], ["telecom", "Telecom"], ["pharma", "Pharma and life sciences"], ["logistics", "Logistics and supply chain"], ["energy", "Energy and utilities"], ["education", "Education"], ["none", "Not sure or other"]],
  interest: [["agents", "AI agents"], ["security", "AI security"], ["cloud", "Cloud migration"], ["credits", "AWS credits and startup programs"], ["marketplace", "AWS Marketplace and go-to-market"], ["us", "Expanding to the US"], ["india", "Entering India"], ["agentsec", "Securing vendor and SaaS agents, shadow AI"], ["govern", "AI governance and audit"], ["map", "Funding a migration (MAP)"], ["buyer", "Buying through AWS Marketplace"], ["agentcore", "Building agents on AWS (AgentCore)"], ["isvaws", "AWS co-sell for software companies"], ["about", "Who is Valamm.AI?"], ["general", "Just exploring"]],
  ctype: [["enterprise", "Large enterprise"], ["mid", "Mid-size company"], ["startup", "Startup"], ["isv", "Software product company"], ["global", "Global company entering India"], ["investor", "Investor or ecosystem"], ["gov", "Government or public sector"], ["si", "Already works with a big vendor or SI"], ["other", "Job seeker, media, analyst or vendor"]],
  cloud: [["aws", "AWS"], ["gcp", "Google Cloud"], ["azure", "Microsoft Azure"], ["paas", "Heroku or similar"], ["vibe", "A vibe-coded app (Lovable, Bolt, Replit)"], ["onprem", "Own data centre"], ["unsure", "Not sure"]],
  pain: [["manual", "Slow, manual, repetitive work"], ["support", "Heavy customer support load"], ["risk", "AI risk and shadow AI"], ["compliance", "Compliance and data protection"], ["cost", "Cloud or operating cost"], ["roi", "Proving the return on AI"], ["pipeline", "Finding customers and pipeline"], ["runway", "Credits and runway"], ["us", "Getting into the US"], ["india", "Getting into India"]],
  size: [["s", "Under 50 people"], ["m", "50 to 500"], ["l", "500 to 5,000"], ["xl", "Over 5,000"]],
};

export type FieldKey = "role" | "industry" | "interest" | "ctype" | "cloud" | "pain" | "size" | "company" | "website" | "person" | "designation" | "notes";

export const DEF: Record<FieldKey, { k: "select" | "tiles" | "text" | "area"; l: string; hint?: string; ph?: string }> = {
  role: { k: "select", l: "Who are you talking to?", hint: "Profile of the person" },
  industry: { k: "select", l: "Which industry are they in?", hint: "Pick the closest" },
  interest: { k: "tiles", l: "What are they most interested in?", hint: "Pick one" },
  ctype: { k: "tiles", l: "What kind of company is it?", hint: "Pick one" },
  cloud: { k: "select", l: "Where do they run today?", hint: "Cloud or hosting" },
  pain: { k: "select", l: "What did they say hurts most?", hint: "Their words, closest match" },
  size: { k: "select", l: "How big is the company?", hint: "" },
  company: { k: "text", l: "Company name", ph: "For example, Infosys" },
  website: { k: "text", l: "Website", ph: "company.com" },
  person: { k: "text", l: "Person’s name", ph: "Name" },
  designation: { k: "text", l: "Designation", ph: "For example, Head of Information Security" },
  notes: { k: "area", l: "Notes", ph: "Anything they said that matters" },
};

const CO_SLD: Record<string, 1> = { co: 1, com: 1, org: 1, net: 1, gov: 1, ac: 1, edu: 1 };
export function parseCo(raw: string): ParsedCo {
  const s = String(raw).trim();
  const m = !/\s/.test(s) && s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:[/?#:].*)?$/i);
  if (!m) return { raw: s, display: s, domain: "", brand: s, tld: "" };
  const d = m[1].toLowerCase(), parts = d.split("."), tld = parts[parts.length - 1];
  let i = parts.length - 2;
  if (parts.length > 2 && CO_SLD[parts[i]]) i--;
  const brand = parts[Math.max(i, 0)];
  const display = /^(https?:\/\/)/i.test(s) || /\//.test(s) || /\./.test(s) ? brand.charAt(0).toUpperCase() + brand.slice(1) : s;
  return { raw: s, display, domain: d, brand: brand.replace(/[-_]/g, " "), tld };
}

export function parseHeadline(t: string): { designation: string; company: string } {
  t = String(t || "").replace(/\s+/g, " ").trim();
  const seg = t.split(/\s*[|•·]\s*/)[0], m = seg.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i), r = { designation: "", company: "" };
  if (m) { r.designation = m[1].replace(/[,\-–]\s*$/, "").trim(); r.company = m[2].replace(/[,\-–]\s*$/, "").trim(); }
  else { const mm = t.match(/(?:^|\|)\s*([^|]*?)\s+(?:at|@)\s+([^|]+)/i); if (mm) { r.designation = mm[1].trim(); r.company = mm[2].trim(); } else r.designation = seg; }
  return r;
}

/* LinkedIn helpers: search links only. We cannot read or verify profiles. */
export function liHref(kind: "people" | "companies", kw: string) { return "https://www.linkedin.com/search/results/" + kind + "/?keywords=" + encodeURIComponent(kw); }
export const LEADERS: [string, string][] = [["CEO", 'CEO OR Founder OR "Managing Director"'], ["CISO", 'CISO OR "Head of Security" OR "Head of Risk"'], ["CIO / CTO", 'CIO OR CTO OR "Head of IT"'], ["CFO", 'CFO OR "Head of Finance"'], ["COO", 'COO OR "Head of Operations"'], ["CHRO", 'CHRO OR "Head of HR"']];

export function liLinks(o: { person?: string; company?: string }, leaders = false, compact = false): [string, string][] {
  const a: [string, string][] = [];
  if (o.person) a.push([o.person, liHref("people", (o.person + " " + (o.company || "")).trim())]);
  if (o.company) {
    a.push([compact ? o.company : "Company page", liHref("companies", o.company)]);
    if (leaders) LEADERS.forEach((x) => a.push([x[0] + " at " + o.company, liHref("people", o.company + " " + x[1])]));
  }
  return a;
}

export function publicLinks(display: string, domain: string): [string, string][] {
  const nm = encodeURIComponent(display || ""), lk: [string, string][] = [];
  if (domain) lk.push(["Their website", "https://" + domain]);
  lk.push(["Search the web", "https://www.google.com/search?q=" + nm + encodeURIComponent(" company what does it do")]);
  lk.push(["LinkedIn page", "https://www.linkedin.com/search/results/companies/?keywords=" + nm]);
  lk.push(["Latest news", "https://www.google.com/search?tbm=nws&q=" + nm]);
  return lk;
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/* Search history: remembered on this phone when the browser allows it, otherwise for this visit. */
const HKEY = "abhay.history";
let memHist: string[] = [];
export function getHist(): string[] {
  try { const v = JSON.parse(localStorage.getItem(HKEY) || "[]"); if (Array.isArray(v)) memHist = v.map(String); } catch { /* storage blocked */ }
  return memHist.slice();
}
export function setHist(a: string[]) { memHist = a.slice(0, 30); try { localStorage.setItem(HKEY, JSON.stringify(memHist)); } catch { /* storage blocked */ } }
export function addHist(q: string) { q = String(q || "").trim(); if (q.length < 2) return; const l = q.toLowerCase(); setHist([q].concat(getHist().filter((x) => x.toLowerCase() !== l))); }
