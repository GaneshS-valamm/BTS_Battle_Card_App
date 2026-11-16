/* Routing engine: turns what the seller knows into battle-card scores. Pure functions, no DOM.
   Ported from the reference implementation (engine.js). Edit DIR, KW, AMBIG and scoreCards here. */
import type { Form, Ranked } from "./types";

export const IND: Record<string, string> = { healthcare: "05", manufacturing: "06", itites: "07", bfsi: "08", retail: "09", auto: "10", telecom: "11", pharma: "12", logistics: "13", energy: "14", education: "15" };
export const IND_LABEL: Record<string, string> = { healthcare: "Healthcare", manufacturing: "Manufacturing", itites: "IT / ITES / BPM", bfsi: "Banking, finance, insurance", retail: "Retail and D2C", auto: "Automotive", telecom: "Telecom", pharma: "Pharma and life sciences", logistics: "Logistics and supply chain", energy: "Energy and utilities", education: "Education" };

export const DIR: Record<string, string[]> = {
  healthcare: ["apollo hospitals","apollo health","apollo clinic","fortis","max healthcare","manipal hospitals","narayana health","aster dm","aster medcity","medanta","kims","cloudnine","practo","pharmeasy","thyrocare","dr lal pathlabs","metropolis","rainbow children","columbia asia","sakra","vikram hospital","nimhans","aiims","sterling hospital","care hospitals","yashoda","tata 1mg","1mg","innovaccer","qure.ai","niramai"],
  manufacturing: ["tata steel","jsw steel","jsw","larsen","l&t","siemens","abb","bosch","godrej","bharat forge","bhel","havells","polycab","crompton","voltas","whirlpool","asian paints","ultratech","ambuja","hindalco","vedanta","sail","cummins","thermax","schaeffler","foxconn","dixon","pidilite","berger","kansai","jindal steel","jindal stainless","tube investments","grasim","honeywell","schneider","3m","ge vernova","hitachi","kirloskar","bajaj electricals","blue star","daikin","lg electronics","samsung electronics","haier","nestle","itc","britannia","hul","hindustan unilever","dabur","marico","parle"],
  itites: ["infosys","tcs","tata consultancy","wipro","hcl","hcltech","tech mahindra","cognizant","accenture","capgemini","ltimindtree","mindtree","mphasis","persistent","coforge","zensar","hexaware","genpact","wns","firstsource","ibm","dxc","cyient","birlasoft","sonata software","tata elxsi","happiest minds","kellton","nagarro","epam","thoughtworks","globallogic","concentrix","teleperformance","ttec","startek","sutherland","conduent","exl","tech data","redington","microsoft","google india","oracle","sap","salesforce","adobe"],
  bfsi: ["hdfc","icici","sbi","state bank","axis bank","kotak","yes bank","idfc","bajaj finance","bajaj finserv","paytm","phonepe","razorpay","lic","life insurance","icici lombard","star health","policybazaar","zerodha","groww","upstox","angel one","muthoot","manappuram","piramal finance","shriram","cred","slice","jupiter money","navi","canara","pnb","punjab national","bank of baroda","union bank","indusind","federal bank","rbl","au small finance","bandhan","aditya birla capital","sbi general","new india assurance","go digit","acko","niva bupa","care health","tata aia","max life","pine labs","bharatpe","mobikwik","cashfree","juspay","zeta","dhan","5paisa"],
  retail: ["reliance retail","dmart","avenue supermarts","flipkart","amazon","myntra","nykaa","meesho","zomato","swiggy","zepto","blinkit","bigbasket","tata cliq","ajio","lenskart","titan","trent","westside","pantaloons","shoppers stop","firstcry","boat","mamaearth","purplle","bata","decathlon","ikea","spencer","more retail","star bazaar","lifestyle international","max fashion","landmark group","croma","reliance digital","vijay sales","pepperfry","urban company","cars24","olx","bookmyshow","eternal","fabindia","manyavar","nike","adidas","h&m","zudio"],
  auto: ["tata motors","mahindra & mahindra","m&m","maruti","suzuki","hyundai","kia","toyota","honda","hero motocorp","bajaj auto","tvs motor","eicher","royal enfield","ashok leyland","ola electric","ather","mg motor","bmw","mercedes","audi","volkswagen","skoda","renault","nissan","tesla","uno minda","motherson","sona comstar","ceat","mrf","apollo tyres","bridgestone","michelin","force motors","escorts kubota","jk tyre","bosch mobility","continental","denso","varroc","endurance","exide","amara raja","tvs","bajaj"],
  telecom: ["jio","airtel","bharti","vodafone idea","vi ","bsnl","mtnl","tata communications","tata tele","act fibernet","hathway","indus towers","tejas networks","nokia","ericsson","huawei","zte","sify","railtel","tikona","excitel","atria","d-vois","reliance jio","sterlite tech","hfcl","vodafone"],
  pharma: ["sun pharma","dr reddy","cipla","lupin","zydus","cadila","aurobindo","glenmark","biocon","divi's","divis","torrent pharma","alkem","mankind","abbott","pfizer","novartis","sanofi","gsk","glaxo","syngene","piramal pharma","ipca","natco","granules","laurus","jubilant","wockhardt","ajanta","eris","emcure","intas","serum institute","bharat biotech","biological e","novo nordisk","astrazeneca","merck","roche","bayer","iqvia","parexel","medpace","thermo fisher","catalent","lonza"],
  logistics: ["delhivery","blue dart","dhl","fedex","ecom express","xpressbees","shadowfax","rivigo","vrl","gati","safexpress","allcargo","mahindra logistics","tci","maersk","adani ports","container corporation","concor","dtdc","porter","lalamove","shiprocket","spoton","ekart","amazon transportation","gujarat pipavav","jsw infrastructure","transport corporation","snowman","coldrush","udaan","zeptonow logistics","borzo","dunzo","ups","kuehne","db schenker","agility","bluedart"],
  energy: ["ntpc","powergrid","power grid","tata power","adani power","adani green","adani energy","jsw energy","torrent power","ongc","indian oil","iocl","bpcl","hpcl","gail","coal india","nhpc","suzlon","waaree","premier energies","inox wind","vikram solar","reliance new energy","cesc","bses","bescom","tneb","tangedco","mseb","mahadiscom","tata power-ddl","ntpc green","sjvn","nlc india","petronet","castrol","shell","bp","totalenergies","schneider electric infra","greenko","renew power","acme solar","avaada","ola cell"],
  education: ["byju","unacademy","physicswallah","physics wallah","upgrad","vedantu","amity","iit","iim","bits pilani","vit","srm","symbiosis","christ university","manipal university","allen","aakash","fiitjee","toppr","simplilearn","great learning","coursera","udemy","ballistic","vidyalankar","narayana educational","podar","dps","delhi public school","ryan international","cbse","nptel","scaler","coding ninjas","masai school","newton school","leap scholar","eruditus","embibe","testbook","adda247","vidya"],
};

export const KW: Record<string, string[]> = {
  healthcare: ["hospital","clinic","healthcare","health care","medical","diagnostic","nursing home","wellness","dental","pathology","pathlabs","medicity","medcity","hospitals"],
  manufacturing: ["manufactur","steel","cement","industries","industrial","engineering","textile","paints","castings","forgings","machinery","tubes","alloys","plastics","chemicals","fertili","ceramics","electricals","packaging","fmcg","foods"],
  itites: ["software","infotech","info tech","technologies","technology","tech solutions","it services","bpo","bpm","consulting","digital services","cloud services","systems","infosystems","datasystems","analytics","outsourcing","global capability","gcc"],
  bfsi: ["bank","finance","finserv","financial","insurance","assurance","capital","nbfc","securities","broking","fintech","credit","mutual fund","amc","wealth","lending","payments","loans","microfinance","housing finance"],
  retail: ["retail","mart","stores","store","fashion","mall","supermarket","grocer","d2c","ecommerce","e-commerce","lifestyle","apparel","jewel","footwear","shopping","marketplace","brands","consumer"],
  auto: ["automotive","motors","motor","autos","automobile","tyre","tire","two wheeler","two-wheeler","dealership","vehicles","mobility","ev "],
  telecom: ["telecom","broadband","isp","communications","fibre","fiber","tower","wireless","cable"],
  pharma: ["pharma","pharmaceutical","biotech","lifesciences","life sciences","laborator","drugs","cdmo","clinical research","biologics","therapeutics","medicines","formulations"],
  logistics: ["logistics","freight","cargo","shipping","supply chain","courier","warehous","transport","3pl","express","carriers","cold chain","fulfil"],
  energy: ["power","energy","solar","renewable","utility","utilities","discom","petroleum","oil","gas","electricity","grid","wind","hydro","thermal","refiner"],
  education: ["education","edtech","academy","learning","coaching","university","college","school","institute","institution","tutor","campus","skilling"],
};

export const AMBIG: Record<string, string[]> = { reliance: ["energy","retail","telecom"], tata: ["manufacturing","auto","itites","retail","energy","telecom"], mahindra: ["auto","manufacturing","itites"], adani: ["energy","logistics"], birla: ["manufacturing","retail","bfsi","telecom"], "aditya birla": ["manufacturing","retail","bfsi","telecom"], bajaj: ["auto","bfsi","manufacturing"], godrej: ["manufacturing","retail"], jindal: ["manufacturing","energy"], amazon: ["retail","itites"], apollo: ["healthcare","auto"], manipal: ["healthcare","education"], narayana: ["healthcare","education"], "l&t": ["manufacturing","itites","bfsi"], larsen: ["manufacturing","itites","bfsi"], hdfc: ["bfsi"], mphasis: ["itites"], itc: ["manufacturing","retail"] };

export function norm(s: unknown): string { return " " + String(s || "").toLowerCase().replace(/[^a-z0-9&.' -]+/g, " ").replace(/\s+/g, " ").trim() + " "; }
export function escRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function hasWord(text: string, w: string): boolean { return new RegExp("(^|[^a-z0-9])" + escRe(w.trim()) + "([^a-z0-9]|$)").test(text); }

export interface ClassifyItem { ind: string; score: number; why: string[] }
export interface ClassifyResult { list: ClassifyItem[]; top: ClassifyItem | null; ambiguous: string[]; known: boolean }

export function classify(raw: string): ClassifyResult {
  const t = norm(raw), score: Record<string, number> = {}, why: Record<string, string[]> = {};
  let known = false;
  if (t.trim().length < 2) return { list: [], top: null, ambiguous: [], known: false };
  for (const ind of Object.keys(DIR)) for (const name of DIR[ind]) {
    if (name.length >= 2 && hasWord(t, name)) { score[ind] = (score[ind] || 0) + 6 + Math.min(name.length, 14) / 7; (why[ind] = why[ind] || []).push(name); known = true; }
  }
  for (const ind of Object.keys(KW)) for (const k of KW[ind]) {
    if (t.indexOf(k) !== -1) { score[ind] = (score[ind] || 0) + 2; (why[ind] = why[ind] || []).push(k.trim()); }
  }
  const amb: string[] = [];
  for (const a of Object.keys(AMBIG)) {
    if (hasWord(t, a)) for (const ind of AMBIG[a]) { if (amb.indexOf(ind) === -1) amb.push(ind); score[ind] = (score[ind] || 0) + 0.5; }
  }
  const list = Object.keys(score).map((ind) => ({ ind, score: score[ind], why: (why[ind] || []).slice(0, 2) })).sort((a, b) => b.score - a.score);
  const top = list[0] || null;
  let ambiguous: string[] = [];
  if (top && list[1] && list[1].score >= top.score - 1.2 && top.score < 8) ambiguous = [top.ind, list[1].ind];
  if (top && amb.length > 1 && top.score < 8) ambiguous = amb.filter((i) => IND[i]).slice(0, 4);
  return { list, top, ambiguous, known };
}

/* inferProduct(text): does it sound like a software, AI or security product company? */
const SECK = /(cyber|infosec|security|secure|zero ?trust|\bsoc\b|siem|threat|firewall|identity|encrypt|\bdlp\b|endpoint|vulnerab|pentest|red ?team|guardrail|sentinel|fortif|compliance)/;
const PRODK = /(saas|platform|software|\bapi\b|\bllm\b|agentic|ai native|ai powered|generative|machine learning|cloud native|devops|product company|automation|\bai\b|startup|start up)/;
const STARTK = /(startup|start up|early stage|pre seed|seed funded|seed round|series a|bootstrapped|founded in 20(2[0-9]))/;
export function inferProduct(text: string) {
  const t = norm(text).replace(/[-.]/g, " ");
  const sec = SECK.test(t), prod = PRODK.test(t) || sec;
  return { security: sec, product: prod, startup: STARTK.test(t) };
}

/* Free-text designation -> role key */
export function roleFromText(s?: string): string {
  const t = norm(s);
  if (/(ciso|chief information security|security|risk|compliance|\bcso\b|\bdpo\b|infosec|grc)/.test(t)) return "ciso";
  if (/(cfo|finance|financial controller|treasur|accounts)/.test(t)) return "cfo";
  if (/(cio|cto|chief technology|chief information|\bit\b|engineering|technology|architect|devops|cloud|infrastructure|\bgcc\b|platform|data head|head of data|vp tech)/.test(t)) return "cio";
  if (/(investor|\bvc\b|venture|angel|accelerator|incubator|principal|portfolio|aws|amazon web|partner manager|\bpdm\b|ecosystem)/.test(t)) return "investor";
  if (/(founder|co-founder|cofounder|ceo|managing director|\bmd\b|owner|chairman|president|proprietor)/.test(t)) return "ceo";
  if (/(chro|human resources|\bhr\b|people officer|chief people|talent|people and culture)/.test(t)) return "chro";
  if (/(customer experience|customer care|customer service|contact cent|\bcx\b|support head|head of support)/.test(t)) return "cx";
  if (/(coo|operations|business head|general manager|\bgm\b|head of|director|vp|vice president)/.test(t)) return "coo";
  if (/(marketing|sales|growth|business development|\bbd\b|product|cmo|cro)/.test(t)) return "sales";
  return "";
}

type Pts = [string, number, string][];

export interface ScoreResult { ranked: Ranked[]; primary: Ranked; alternates: Ranked[]; notes: string[]; nonStartup: boolean }

export function scoreCards(f: Form): ScoreResult {
  const s: Record<string, number> = {}, r: Record<string, string[]> = {};
  const add = (id: string, pts: number, why: string) => { s[id] = (s[id] || 0) + pts; (r[id] = r[id] || []).push(why); };
  const role = f.role || roleFromText(f.designation);
  const ind = f.industry || "";
  const ctype = f.ctype || "";
  const cloud = f.cloud || "";
  const typeLed = ["startup", "isv", "global", "investor", "gov", "other"].indexOf(ctype) !== -1;
  // AWS credits and startup programmes are for startups only. A known established company, or any non-startup type, never gets them.
  const nonStartup = ["enterprise", "mid", "isv", "global", "investor", "gov", "other", "si"].indexOf(ctype) !== -1 || (!!f.knownCompany && ctype !== "startup");
  const notes: string[] = [];
  if (ind && IND[ind]) add(IND[ind], typeLed ? 6 : 10, "Industry: " + IND_LABEL[ind]);
  const startupCard = cloud && ["gcp", "azure", "paas", "vibe"].indexOf(cloud) !== -1 ? "17" : "16";
  if (ctype === "startup") { add("16", 14, "Startup"); if (startupCard === "17") add("17", 6, "Runs on another cloud or a vibe-coded app"); }
  if (ctype === "isv") add("18", 14, "Software product company");
  if (ctype === "global") add("20", 14, "Global company entering India");
  if (ctype === "investor") add("25", 14, "Investor or ecosystem partner");
  if (ctype === "gov") add("42", 14, "Government or public sector");
  if (ctype === "other") add("43", 14, "Job seeker, media, analyst or vendor");
  if (ctype === "mid") add("40", 6, "Mid-size company");
  if (ctype === "si") add("41", 12, "Already has a big vendor or SI");
  if ((f.size === "s" || f.size === "m") && ctype !== "startup" && ctype !== "other") add("40", 4, "Smaller company, small IT team");
  const I: Record<string, Pts> = { agents: [["03", 8, "Interest: AI agents"], ["01", 2, "Interest: AI agents"]], security: [["04", 8, "Interest: AI security"], ["26", 3, "Interest: AI security"]], cloud: [["21", 8, "Interest: cloud migration"]], credits: [["16", 9, "Interest: AWS credits"]], marketplace: [["18", 9, "Interest: Marketplace and GTM"]], us: [["19", 9, "Interest: US expansion"]], india: [["20", 9, "Interest: India entry"]], general: [["01", 5, "Just exploring"]], about: [["02", 9, "Wants to know about Valamm.AI"]], agentsec: [["26", 9, "Interest: securing vendor and SaaS agents"], ["27", 5, "Interest: securing vendor and SaaS agents"], ["28", 3, "Interest: securing vendor and SaaS agents"], ["04", 3, "Interest: AI security"]], govern: [["31", 9, "Interest: AI governance and audit"], ["22", 3, "Interest: AI governance and audit"]], map: [["32", 9, "Interest: funding a migration (MAP)"], ["21", 3, "Interest: funding a migration (MAP)"]], buyer: [["33", 9, "Interest: buying through AWS Marketplace"]], agentcore: [["34", 9, "Interest: building agents on AWS"], ["03", 2, "Interest: building agents on AWS"]], isvaws: [["35", 9, "Interest: AWS co-sell and ISV programmes"], ["18", 3, "Interest: AWS co-sell and ISV programmes"]] };
  if (nonStartup && f.interest === "credits") notes.push("AWS credits are for startups only, so that interest was not applied");
  else (I[f.interest || ""] || []).forEach((x) => add(x[0], x[1], x[2]));
  if (f.interest === "cloud" && ctype === "startup") add("17", 7, "Startup interested in migration");
  const R: Record<string, Pts> = { ciso: [["22", 10.5, "Role: security or risk"], ["26", 4, "Role: security or risk"], ["27", 3, "Role: security or risk"]], cfo: [["23", 10.5, "Role: finance"], ["32", 2, "Role: finance"], ["33", 2, "Role: finance"]], cio: [["24", 10.5, "Role: technology or GCC"], ["34", 2, "Role: technology"], ["28", 2, "Role: technology"]], chro: [["38", 9, "Role: HR and people"]], cx: [["39", 9, "Role: customer experience"]], coo: [["37", 8, "Role: operations"]], investor: [["25", 9, "Role: investor or AWS colleague"]], aws: [["25", 9, "Role: investor or AWS colleague"]] };
  (R[role] || []).forEach((x) => add(x[0], x[1], x[2]));
  const P: Record<string, Pts> = { manual: [["03", 4, "Pain: manual work"]], support: [["03", 4, "Pain: support load"]], risk: [["04", 5, "Pain: AI risk"], ["27", 3, "Pain: AI risk and shadow AI"], ["26", 3, "Pain: AI risk"]], cost: [["21", 3, "Pain: cloud cost"], ["23", 3, "Pain: cost"]], compliance: [["04", 4, "Pain: compliance"], ["31", 4, "Pain: compliance"]], pipeline: [["18", 4, "Pain: pipeline"]], runway: [["16", 5, "Pain: runway"]], us: [["19", 5, "Pain: entering the US"]], india: [["20", 5, "Pain: entering India"]], roi: [["23", 5, "Pain: proving ROI"]] };
  if (nonStartup && f.pain === "runway") notes.push("Credits and runway are for startups only, so that pain was not applied");
  else (P[f.pain || ""] || []).forEach((x) => add(x[0], x[1], x[2]));
  const C: Record<string, Pts> = { onprem: [["21", 6, "Runs on-premises"]], gcp: [["17", 4, "Runs on Google Cloud"], ["21", 2, "Runs on Google Cloud"]], azure: [["17", 4, "Runs on Azure"], ["21", 2, "Runs on Azure"]], paas: [["17", 5, "Runs on Heroku or similar"]], vibe: [["17", 6, "Vibe-coded app"]] };
  (C[cloud] || []).forEach((x) => { if (!((typeLed || nonStartup) && ctype !== "startup" && x[0] === "17")) add(x[0], x[1], x[2]); });
  if (!Object.keys(s).length) add("01", 1, "General pitch");
  let ranked: Ranked[] = Object.keys(s).map((id) => ({ id, score: s[id], reasons: r[id] })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (nonStartup) ranked = ranked.filter((x) => x.id !== "16" && x.id !== "17");
  if (!ranked.length) ranked = [{ id: "01", score: 1, reasons: ["General pitch"] }];
  return { ranked, primary: ranked[0], alternates: ranked.slice(1, 4), notes, nonStartup };
}
