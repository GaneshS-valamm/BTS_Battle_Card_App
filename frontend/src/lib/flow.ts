/* Builds the conversation for one card: warm-up, who we are, big picture, their world,
   how we help, go deeper, next step. Ported from buildFlow in the reference implementation. */
import type { Card, Content } from "./types";

export const PARTCOL: Record<string, string> = { A: "#6A38D8", B: "#4A2AA0", C: "#148A78", D: "#D946A8", G: "#3B2A78", H: "#148A78", I: "#D946A8" };
export const PARTNAME: Record<string, string> = { A: "Core pitches and deep dives", B: "Industry CXO cards", C: "Startups, AWS and GTM", D: "Role and partner cards", G: "AI security: any agent, any vendor", H: "AWS programs and Marketplace", I: "More people and situations" };
export const PHCOL = ["#6A38D8", "#4A2AA0", "#148A78", "#D946A8", "#F2A93B", "#6A38D8"];
export const PAGES = ["Open and connect", "Their world and our help", "Handle and close"];
export const ROLELAB: Record<string, string> = { ceo: "CEO or founder", ciso: "CISO or risk leader", cfo: "CFO", cio: "CIO or CTO", coo: "COO or operations head", chro: "CHRO", cx: "customer-experience head", investor: "investor or AWS colleague", aws: "investor or AWS colleague", sales: "sales or growth leader" };

const CREDIT_OK: Record<string, 1> = { "16": 1, "17": 1, "25": 1, "36": 1 }; // AWS credits belong to startup cards only
const PITCH_FOR: Record<string, number> = { "01": 1, "02": 0, "03": 1, "04": 2, "16": 4, "17": 3, "18": 5, "19": 5, "20": 0, "21": 3, "22": 2, "23": 1, "24": 3, "25": 4, "26": 2, "27": 2, "28": 2, "29": 2, "30": 2, "31": 2, "32": 3, "33": 5, "34": 1, "35": 5, "36": 4, "37": 1, "38": 1, "39": 1, "40": 1, "41": 0, "42": 1, "43": 0 };
const PROBES = ["If they pause: “Tell me more about that.”", "If they pause: “What does that look like day to day?”", "If they pause: “Who feels that most?”", "If they pause: “What have you tried so far?”", "If they pause: “What would good look like?”"];

export interface Beat {
  ph: number; kind: "std" | "signals" | "pitch" | "stories" | "obj" | "close"; lab: string;
  q?: string; say?: string; sayLab?: string; src?: string; bridge?: string; probe?: string; li?: boolean;
}

export interface Ctx { company: string; person: string; designation: string; website: string; notes: string; role: string }

function words(s: string): string[] { return String(s).toLowerCase().match(/[a-z]{4,}/g) || []; }
function overlap(a: string, b: string) { const A = words(a), B = words(b); if (!A.length || !B.length) return 0; let m = 0; A.forEach((w) => { if (B.indexOf(w) > -1) m++; }); return m / Math.min(A.length, B.length); }
export function firstName(n?: string) { return String(n || "").trim().split(/\s+/)[0] || ""; }
export function plain(s: string) { return String(s).replace(/^[“"]\s*/, "").replace(/\s*[”"]$/, ""); }
export function splitListen(l: string) { const p = String(l).split("→"); return { heard: plain(p[0].trim()), so: (p[1] || "").trim() }; }

function elevated(c: Card): string[] {
  const id = c.id;
  if (+id >= 26 && +id <= 31) return ["How is the conversation about AI agents changing in your leadership and board meetings?", "Where do you feel least certain today: which agents are running, what they can reach, or what they can do on their own?", "When a regulator, customer or auditor asks about AI, what is the hardest question to answer?"];
  if (id === "32" || id === "33") return ["How central is AWS to your plans over the next two years?", "Where does your technology estate hold the business back most today: cost, speed, security or skills?", "What would make a partner genuinely useful to you here?"];
  if (id === "34") return ["How do you see agents moving from demos to real production work in your company?", "Which is harder for your team today: building agents, running them safely, or proving they work?", "What would you want a partner to take off your plate?"];
  if (id === "35") return ["Which market matters most to you over the next two years, and what would winning there look like?", "How do you want AWS sellers to see your product?", "Who on your team owns the AWS relationship?"];
  if (id === "36") return ["Where do you want the company to be in 18 months: product, customers or funding?", "What is the one thing that, solved this quarter, would speed everything up?", "Where does your runway feel tightest: compute spend, the team, or finding customers?"];
  if (id === "42") return ["Which citizen services matter most to your department over the next two years?", "What would make a measurable difference to citizens within a year?", "How does your department decide on new technology?"];
  if (c.part === "B") return ["Looking two or three years out, how do you see AI changing the way companies in " + c.name + " compete?", "Where is the pressure highest for your leadership today: cost, speed, customer experience or risk?", "If AI really worked for you a year from now, what would your board notice first?"];
  if (id === "01" || id === "03") return ["Where do you see AI doing real, everyday work in your organisation over the next two years, beyond demos?", "Where is the pressure highest for your leadership today: cost, speed, customer experience or risk?", "If AI really worked for you a year from now, what would your board notice first?"];
  if (id === "02") return ["Which market matters most for your growth over the next two years: India, the US, or both?", "What is the big bet your leadership is making this year?", "What would success look like for you at the end of next year?"];
  if (id === "04" || id === "22") return ["How is the conversation about AI risk changing in your leadership and board meetings?", "Where do you feel least certain today: what AI is running, what data it touches, or what it can do on its own?", "When a regulator or auditor asks about AI, what is the hardest question to answer?"];
  if (id === "16" || id === "17") return ["Where do you want the company to be in 18 months: product, customers or funding?", "What is the one thing that, solved this quarter, would speed everything up?", "Where does your runway feel tightest: the team, cloud and AI spend, or finding customers?"];
  if (id === "18" || id === "19") return ["Which market matters most to you over the next two years, and what would winning there look like?", "What has been the hardest part of getting in front of enterprise buyers there?", "Who on your team owns that goal today?"];
  if (id === "20") return ["What does success in India look like for your leadership in 18 months?", "What has slowed you down most: local team, partners, compliance or customers?", "Who on your side owns the India plan?"];
  if (id === "21" || id === "24") return ["How does your leadership see the role of technology in the business over the next three years?", "Where does your technology estate hold the business back most today: cost, speed, security or skills?", "If your data were truly AI-ready, what is the first thing you would do with it?"];
  if (id === "23") return ["How are you thinking about the return on AI spend this year, beyond pilots?", "Where does cost leak the most today: manual effort, rework, cloud or vendors?", "What proof would you need before scaling an AI project from one team to the whole company?"];
  if (id === "25") return ["What do you see as the biggest gap between a promising startup and one that scales well on AWS?", "How do you help founders with infrastructure and go-to-market choices today?", "What would make a partner genuinely useful to your portfolio?"];
  return ["Looking two or three years out, where will AI change your business the most?", "What is the big bet your leadership is making this year?", "What would success look like a year from now?"];
}

/** The "say this, not that" lines relevant to a card. Credits guard only on startup cards. */
export function guards(D: Content, c: Card): [string, string][] {
  const ix = [3, 4, 2];
  if (CREDIT_OK[c.id]) ix.unshift(0);
  if (c.id === "05") ix.push(6);
  if (c.part === "B" || c.id === "04" || c.id === "22") ix.push(1);
  return ix.filter((i, n) => ix.indexOf(i) === n).slice(0, 4).map((i) => D.ref.guard[i]).filter(Boolean);
}

function warmFor(D: Content, c: Card): string[] {
  const id = +c.id, W = D.qb.WARM || {};
  if ([16, 17, 18, 36].indexOf(id) > -1) return W.startup || [];
  if (id === 25) return W.investor || [];
  if (id === 43 || id <= 4) return (W.any || []).slice(0, 5);
  return W.enterprise || [];
}

export function buildFlow(D: Content, c: Card, ctx: Partial<Ctx>): Beat[] {
  const B: Beat[] = [], asked: string[] = [];
  const nm = firstName(ctx.person), co = ctx.company, ds = ctx.designation, role = ctx.role || "";
  const qc = D.qb.CARD[c.id] || { biz: [], deep: [], big: "growth" };
  function ask(ph: number, lab: string, q: string | undefined, extra?: Partial<Beat> | null) {
    if (!q) return;
    if (asked.some((a) => overlap(a, q) >= 0.6)) return;
    asked.push(q);
    B.push({ ph, kind: "std", lab, q, probe: PROBES[B.length % PROBES.length], ...(extra || {}) });
  }
  if (ctx.person || ctx.company) B.push({ ph: 0, kind: "std", lab: "Before you speak", li: true, probe: "Thirty seconds of reading changes the whole conversation." });
  B.push({ ph: 0, kind: "std", lab: "Say hello, then ask", say: "Hi" + (nm ? " " + nm : "") + ", I’m [your name] from VirtualizingHumans.AI. Great to meet you.", q: "How has your week been so far? Anything that has caught your eye?", probe: "Smile, listen, and let them finish before you move on." }); asked.push("week so far");
  B.push({ ph: 0, kind: "std", lab: "Get to know them", q: co ? "What is " + co + " focused on this year?" : "What are you focused on this year?", probe: ds ? "Then: “And what does your role as " + ds + " cover?”" : "Then: “And what does your role cover day to day?”" }); asked.push("focused this year");
  let wn = 0; warmFor(D, c).forEach((q) => { if (wn < 2 && !asked.some((a) => overlap(a, q) >= 0.5)) { ask(0, "Keep it human", q); wn++; } });
  const n0 = c.news && c.news[0];
  if (n0) B.push({ ph: 0, kind: "std", lab: "A hook from the news", say: n0.t, sayLab: "You could mention", src: n0.s, q: "Did you see that? What do you make of it?", probe: "This is the bridge from small talk into their world." });
  let pi = PITCH_FOR[c.id]; if (pi == null) pi = 1; const P = D.ref.pitches[pi];
  B.push({ ph: 1, kind: "std", lab: "What we do, in one line", bridge: "“Let me tell you very quickly what we do, then I would love to hear more about you.”", say: P[1], sayLab: "Say", q: "Does that sound close to anything you are working on?", probe: "Keep it to one breath. Then stop talking." });
  elevated(c).forEach((q, i) => ask(2, "Big picture", q, i === 0 ? { bridge: "“That helps. I would like to understand how you are thinking about the bigger picture.”" } : null));
  ((D.qb.BIG && D.qb.BIG[qc.big]) || []).slice(0, 3).forEach((q) => ask(2, "Big picture", q));
  const hello = plain(c.hello).replace(/^Welcome!\s*/i, "").replace(/\[name\]/g, "your name");
  let firstBiz = true;
  const biz = (lab: string, q: string | undefined) => { ask(3, lab, q, firstBiz ? { bridge: "“Let’s get a little more specific about " + (co ? co : "your business") + ".”" } : null); if (asked[asked.length - 1] === q) firstBiz = false; };
  biz("Their world", hello); if (!hello) biz("Their world", c.open[0]); biz("Their world", c.open[1]); biz("Their world", c.open[2]);
  const rq = role && D.qb.ROLE ? D.qb.ROLE[role] : null;
  if (rq) rq.slice(0, 2).forEach((q) => biz("As a " + (ROLELAB[role] || role), q));
  qc.biz.slice(0, 4).forEach((q) => biz("Their world", q));
  B.push({ ph: 3, kind: "signals", lab: "What did you hear?" });
  B.push({ ph: 4, kind: "pitch", lab: "Where we could help", bridge: "“Based on what you have told me, here is where we could help.”" });
  B.push({ ph: 4, kind: "stories", lab: c.storiesTitle });
  let firstDeep = true;
  const deep = (lab: string, q: string | undefined) => { ask(4, lab, q, firstDeep ? { bridge: "“Can I ask a couple of things so we get this specific?”" } : null); if (asked[asked.length - 1] === q) firstDeep = false; };
  deep("Go deeper", c.open[3]); deep("Go deeper", c.open[4]);
  qc.deep.slice(0, 3).forEach((q) => deep("Go deeper", q));
  (c.follow || []).forEach((q) => deep("Make it specific", q));
  qc.deep.slice(3).forEach((q) => deep("Make it specific", q));
  B.push({ ph: 4, kind: "obj", lab: "If they push back" });
  B.push({ ph: 5, kind: "close", lab: "Your next step", bridge: "“I would suggest one small next step.”" });
  return B;
}

/** Questions on a phase, excluding the special beats rendered elsewhere on the page. */
export function phaseQs(B: Beat[], ph: number): Beat[] {
  return B.filter((x) => x.ph === ph && x.kind === "std" && x.q && !x.li && x.lab !== "A hook from the news" && x.lab !== "What we do, in one line" && x.lab !== "Say hello, then ask");
}
