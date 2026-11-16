import { Fragment, useState, type ReactNode } from "react";
import type { Report, ReportResponse } from "../lib/types";
import { entMatches } from "../lib/search";
import { copyText, getHist, parseCo } from "../lib/util";
import { repKey, useStore } from "../store";

const NF = "Not found";

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rsec"><h3>{title}</h3>{children}</section>;
}
function Nf({ v }: { v?: string }) { return <>{v && v.trim() ? v : <span className="text-muted italic">{NF}</span>}</>; }

export function reportText(company: string, r: Report, catalog: Record<string, { name: string }>, live: boolean): string {
  const L: string[] = [];
  L.push(`Market Insight Report: ${company}`);
  L.push(live ? "Source: live web search (verify before relying on it)" : "Source: Gemini general knowledge, not a live web search (verify before relying on it)");
  L.push("", "ABOUT", r.about);
  r.facts.forEach((f) => L.push(`${f.k}: ${f.v}`));
  if (r.products.length) { L.push("", "PRODUCTS AND SERVICES"); r.products.forEach((p) => L.push(`- ${p.name}${p.line ? ": " + p.line : ""}`)); }
  L.push("", "COUNTRIES", r.countries.list.join(", ") || NF, `India: ${r.countries.india}`);
  if (r.channels.length) { L.push("", "CHANNELS AND PARTNERS"); r.channels.forEach((c) => L.push(`- ${c.type}: ${c.detail}`)); }
  L.push("", "IT AND CLOUD", `Cloud: ${r.infra.cloud}`, r.infra.detail);
  if (r.infra.stack.length) L.push(`Stack: ${r.infra.stack.join(", ")}`);
  L.push(`Ask: ${r.infra.ask}`);
  L.push("", `INDIA MARKET SIZE (estimate, ${r.market.year})`, `TAM ${r.market.tam.v} · SAM ${r.market.sam.v} · SOM ${r.market.som.v}`, `Basis: ${r.market.basis}`);
  if (r.mandates.length) { L.push("", "GOVERNMENT MANDATES"); r.mandates.forEach((m) => L.push(`- ${m.name}: ${m.why}`)); }
  if (r.signals.length) { L.push("", "RECENT SIGNALS"); r.signals.forEach((x) => L.push(`- ${x}`)); }
  if (r.fit.length) { L.push("", "WHERE WE CAN HELP"); r.fit.forEach((f) => L.push(`- ${catalog[f.id]?.name || f.id}: ${f.why}`)); }
  if (r.openers.length) { L.push("", "OPENERS"); r.openers.forEach((x) => L.push(`- ${x}`)); }
  if (r.sources?.length) { L.push("", "SOURCES"); r.sources.forEach((x) => L.push(`- ${x.title}: ${x.url}`)); }
  L.push("", "Internal use only. Do not share with the customer.");
  return L.join("\n");
}

function Body({ company, rr }: { company: string; rr: ReportResponse }) {
  const { D } = useStore();
  const r = rr.report, cat = D.offers.catalog;
  const [copied, setCopied] = useState("Copy as text");
  const conf = r.confidence || "low";
  return (
    <>
      <div className={"banner" + (rr.live ? "" : " warn")}>
        <b>{rr.live ? "From a live web search." : "From Gemini’s general knowledge, not a live web search."}</b>{" "}
        Confidence: {conf}.{!r.recognised ? " The company was not clearly recognised, so treat everything below with care." : ""}
        <div className="sub">
          {rr.cached ? "Saved report" : "Built just now"}{rr.createdAt ? `, ${new Date(rr.createdAt).toLocaleString()}` : ""}. Market sizes are estimates. Verify figures before you rely on them, and never show this page to the customer.
        </div>
      </div>

      <Sec title="About">
        <p><Nf v={r.about} /></p>
        {r.facts.length ? <dl className="kv">{r.facts.map((f, i) => <Fragment key={i}><dt>{f.k}</dt><dd><Nf v={f.v} /></dd></Fragment>)}</dl> : null}
      </Sec>

      <Sec title="Products and services">
        {r.products.length ? <ul>{r.products.map((p, i) => <li key={i}><b>{p.name}</b>{p.line ? `: ${p.line}` : ""}</li>)}</ul> : <p><Nf /></p>}
      </Sec>

      <Sec title="Countries present">
        <p>{r.countries.list.length ? r.countries.list.join(", ") : <Nf />}</p>
        <p className="mt-2"><b>India:</b> <Nf v={r.countries.india} /></p>
      </Sec>

      <Sec title="Channels and partners">
        {r.channels.length ? <ul>{r.channels.map((c, i) => <li key={i}><b className="capitalize">{c.type}</b>{c.detail ? `: ${c.detail}` : ""}</li>)}</ul> : <p><Nf /></p>}
      </Sec>

      <Sec title="IT infrastructure and cloud">
        <p><span className={"pill" + (r.infra.cloud === "Unknown" ? " unk" : "")}>{r.infra.cloud}</span></p>
        <p className="mt-2"><Nf v={r.infra.detail} /></p>
        {r.infra.evidence.length ? <><p className="mt-2 text-sm font-bold text-muted">Evidence</p><ul>{r.infra.evidence.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
        {r.infra.stack.length ? <div className="chips">{r.infra.stack.map((x) => <span key={x} className="pill unk">{x}</span>)}</div> : null}
        <div className="sb mt-3"><small>Ask</small>{r.infra.ask}</div>
      </Sec>

      <Sec title={`India market size · estimate${r.market.year && r.market.year !== NF ? ", " + r.market.year : ""}`}>
        <div className="mkt">
          {(["tam", "sam", "som"] as const).map((k) => (
            <div key={k}><b>{k.toUpperCase()}</b><span>{r.market[k].v || NF}</span>{r.market[k].n ? <small>{r.market[k].n}</small> : null}</div>
          ))}
        </div>
        <p className="note"><b>Basis:</b> {r.market.basis}. Model estimates: never present these to a customer as facts.</p>
      </Sec>

      <Sec title="Government mandates">
        {r.mandates.length ? <ul>{r.mandates.map((m, i) => <li key={i}><b>{m.name}</b>{m.why ? `: ${m.why}` : ""}</li>)}</ul> : <p><Nf /></p>}
      </Sec>

      <Sec title="Recent signals">
        {r.signals.length ? <ul>{r.signals.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p><Nf /></p>}
      </Sec>

      <Sec title="Where we can help">
        {r.fit.length ? r.fit.map((f) => (
          <div key={f.id} className="of" style={{ background: "#fff" }}>
            <div className="ot" style={{ padding: "9px 10px" }}>
              <em className={cat[f.id]?.brand === "Valamm.AI" ? "val" : ""}>{cat[f.id]?.brand}</em>
              <b>{cat[f.id]?.name || f.id}</b><small>{f.why}</small>
            </div>
          </div>
        )) : <p><Nf /></p>}
      </Sec>

      <Sec title="Conversation openers">
        {r.openers.length ? <ul>{r.openers.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p><Nf /></p>}
      </Sec>

      {r.caveats ? <Sec title="Check before you rely on it"><p>{r.caveats}</p></Sec> : null}

      <Sec title={r.sources?.length ? "Sources" : "Verify it yourself"}>
        {r.sources?.length ? (
          <ul>{r.sources.map((x) => <li key={x.url}><a className="text-coral font-bold break-words" href={x.url} target="_blank" rel="noopener noreferrer">{x.title || x.url}</a></li>)}</ul>
        ) : (
          <div className="chips">
            <a className="chip" target="_blank" rel="noopener noreferrer" href={"https://www.google.com/search?q=" + encodeURIComponent(company)}>Search the web &#8599;</a>
            <a className="chip" target="_blank" rel="noopener noreferrer" href={"https://www.google.com/search?tbm=nws&q=" + encodeURIComponent(company)}>Latest news &#8599;</a>
            <a className="chip" target="_blank" rel="noopener noreferrer" href={"https://www.linkedin.com/search/results/companies/?keywords=" + encodeURIComponent(company)}>LinkedIn page &#8599;</a>
          </div>
        )}
      </Sec>

      <div className="chips mt-4">
        <button type="button" className="chip pick" onClick={async () => { const ok = await copyText(reportText(company, r, cat, rr.live)); setCopied(ok ? "Copied" : "Could not copy"); setTimeout(() => setCopied("Copy as text"), 1800); }}>{copied}</button>
      </div>
    </>
  );
}

function PickCompany() {
  const { D, openReport } = useStore();
  const [q, setQ] = useState("");
  const ents = q.trim().length >= 2 ? entMatches(D.ents, q, 6) : [];
  const recent = getHist().slice(0, 5);
  const go = (name: string, domain = "") => { if (!name.trim()) return; const p = parseCo(name); openReport(p.domain ? p.display : name.trim(), p.domain || domain); };
  return (
    <section className="view">
      <div className="eyebrow">Market Insight Report</div>
      <h2>Which company?</h2>
      <p className="lead">Type the company name or its website. VHumans asks before using any AI tokens.</p>
      <label className="field" htmlFor="r-co">
        <span>Company name or website</span>
        <input id="r-co" type="text" value={q} autoFocus autoComplete="off" placeholder="For example, Infosys or infosys.com" enterKeyHint="go"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(q); }} />
      </label>
      {ents.length ? <div className="chips">{ents.map((e) => <button key={e[1]} type="button" className="chip" onClick={() => go(e[1])}>{e[1]}</button>)}</div> : null}
      {!q && recent.length ? <><div className="grp">Recent</div><div className="chips">{recent.map((x) => <button key={x} type="button" className="chip" onClick={() => go(x)}>{x}</button>)}</div></> : null}
      <div className="mt-5"><button type="button" className="cta" disabled={!q.trim()} onClick={() => go(q)}>Continue</button></div>
    </section>
  );
}

export default function ReportView() {
  const { s, set, startReport, serve, findCompany, cfg, go } = useStore();
  const rf = s.repFor!;
  if (s.repState === "pick" || !rf.company) return <PickCompany />;
  const rr = s.reps[repKey(rf.company, rf.domain)];
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const fromCard = !!s.card && s.ctx.company === rf.company;

  if (s.repState === "ask" || confirmRefresh) {
    return (
      <section className="view">
        <div className="eyebrow">Market Insight Report</div>
        <h2>{rf.company}</h2>
        <div className="banner warn">
          <b>This report uses AI tokens.</b> {!cfg.llm ? "When the AI service is set up, it researches the company and takes up to a minute." : cfg.webSearch ? "It runs a live Google Search and takes about 30 to 60 seconds." : "It uses Gemini’s general knowledge (no live web search) and takes about 20 to 40 seconds."} Only build it when it will help the conversation.
        </div>
        {!cfg.llm ? <div className="banner warn"><b>The AI service is not set up yet.</b> An administrator needs to add the Gemini API key on the server before reports can be built.</div> : null}
        <div className="blk">
          <h3>What is included</h3>
          <ul>
            <li>About the company, with key facts</li><li>Products and services</li><li>Countries present, and their India presence</li>
            <li>Channels and partners</li><li>IT infrastructure and cloud (named only with public evidence)</li>
            <li>India market size: TAM, SAM, SOM (labelled as estimates)</li><li>Government mandates it touches, for example DPDP</li>
            <li>Recent signals</li><li>Where we can help, and conversation openers</li>
          </ul>
          <p className="note">Anything not found says “Not found”. Nothing is invented.</p>
        </div>
        <div className="mt-5 grid gap-2.5">
          <button type="button" className="cta" disabled={!cfg.llm} onClick={() => { setConfirmRefresh(false); startReport(confirmRefresh); }}>{confirmRefresh ? "Yes, build a fresh report" : "Yes, build the report"}</button>
          <button type="button" className="cta ghost" onClick={() => { if (confirmRefresh) setConfirmRefresh(false); else history.back(); }}>Not now</button>
        </div>
      </section>
    );
  }

  if (s.repState === "loading") {
    return (
      <section className="view">
        <div className="eyebrow">Market Insight Report</div>
        <h2>{rf.company}</h2>
        <div className="blk flex flex-col items-center gap-3 py-8 text-center">
          <span className="spin lg" />
          <b>Researching {rf.company}…</b>
          <p className="note m-0">{cfg.webSearch ? "Searching the web and writing one page. This takes about 30 to 60 seconds." : "Writing one page from Gemini’s general knowledge. This takes about 20 to 40 seconds."} Keep this screen open.</p>
        </div>
      </section>
    );
  }

  if (s.repState === "error" || !rr) {
    return (
      <section className="view">
        <div className="eyebrow">Market Insight Report</div>
        <h2>{rf.company}</h2>
        <div className="banner warn"><b>The report could not be built.</b> {s.repError}</div>
        <div className="go grid gap-2.5">
          {cfg.llm ? <button type="button" className="cta" onClick={() => set({ repState: "ask" })}>Try again</button> : null}
          <button type="button" className="cta ghost" onClick={() => history.back()}>Back</button>
        </div>
      </section>
    );
  }

  return (
    <section className="view">
      <div className="eyebrow">Market Insight Report · internal</div>
      <h2>{rf.company}</h2>
      <Body company={rf.company} rr={rr} />
      <div className="go grid grid-cols-2 gap-2.5">
        <button type="button" className="cta ghost" style={{ fontSize: 17 }} disabled={!cfg.llm} onClick={() => setConfirmRefresh(true)}>Refresh</button>
        <button type="button" className="cta" style={{ fontSize: 17 }} onClick={() => (fromCard ? go("card") : s.form.company === rf.company ? serve() : findCompany(rf.company, rf.domain))}>Show the battle card</button>
      </div>
    </section>
  );
}
