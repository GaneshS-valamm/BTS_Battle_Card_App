import { useState, type CSSProperties, type ReactNode } from "react";
import { LiChips } from "../components/Controls";
import { api } from "../lib/api";
import { guards, PAGES, PARTCOL, PHCOL, phaseQs, ROLELAB, splitListen, type Beat } from "../lib/flow";
import type { Card } from "../lib/types";
import { copyText, LEADERS, liHref } from "../lib/util";
import { useStore } from "../store";

function Sec({ title, col, cls = "", children }: { title: string; col: string; cls?: string; children: ReactNode }) {
  return <section className={"bc " + cls}><h3 style={{ "--c": col } as CSSProperties}><i />{title}</h3>{children}</section>;
}
function SayBox({ txt, lab }: { txt: string; lab?: string }) { return <div className="sb">{lab ? <small>{lab}</small> : null}{txt}</div>; }
function Ul({ a }: { a: string[] }) { return <ul>{a.map((x, i) => <li key={i}>{x}</li>)}</ul>; }

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [t, setT] = useState(label);
  return <button className="copy" type="button" onClick={async () => { const ok = await copyText(text); setT(ok ? "Copied" : "Press and hold the text to copy"); setTimeout(() => setT(label), 1800); }}>{t}</button>;
}

function QList({ items, cap = 99 }: { items: { q: string; bridge?: string }[]; cap?: number }) {
  const { s, set } = useStore();
  const id = s.card!.id;
  const li = (b: { q: string; bridge?: string }, n: number) => {
    const k = id + "|" + b.q.slice(0, 48);
    return [
      b.bridge ? <li key={k + "b"} className="br">{b.bridge}</li> : null,
      <li key={k}>
        <button type="button" className={"qb" + (s.ticks[k] ? " done" : "")} aria-pressed={!!s.ticks[k]} onClick={() => set((x) => ({ ticks: { ...x.ticks, [k]: !x.ticks[k] } }))}>
          <span className="n">{n}</span><span>{b.q}</span>
        </button>
      </li>,
    ];
  };
  const main = items.slice(0, cap), more = items.slice(cap);
  return (
    <>
      <ol className="bq">{main.map((b, i) => li(b, i + 1))}</ol>
      {more.length ? <details className="mq"><summary>+ {more.length} more question{more.length > 1 ? "s" : ""}</summary><ol className="bq">{more.map((b, i) => li(b, cap + i + 1))}</ol></details> : null}
    </>
  );
}

function Signals({ c }: { c: Card }) {
  const { s, set } = useStore();
  const hs = s.heard[c.id] || {};
  return (
    <div className="sigs">
      {(c.listen || []).map((l, i) => {
        const sp = splitListen(l);
        return (
          <button key={i} type="button" className={"sig" + (hs[i] ? " on" : "")} aria-pressed={!!hs[i]}
            onClick={() => set((x) => ({ heard: { ...x.heard, [c.id]: { ...(x.heard[c.id] || {}), [i]: !(x.heard[c.id] || {})[i] } } }))}>
            <b>{sp.heard}</b>{sp.so ? <small>So: {sp.so}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function Pairs({ g }: { g: [string, string][] }) {
  return <>{g.map((x, i) => <div key={i} className="pair"><div className="yes"><small>Say this</small>{x[0]}</div><div className="no"><small>Not this</small>{x[1]}</div></div>)}</>;
}

function Offers({ c }: { c: Card }) {
  const { D } = useStore();
  const list = (D.offers.map[c.id] || []).map(([oid, why]) => ({ d: D.offers.catalog[oid], why })).filter((x) => x.d);
  if (!list.length) return null;
  const row = (x: (typeof list)[number], i: number) => {
    const br = x.d.brand.indexOf(" and ") > -1 ? "VirtualizingHumans.AI + Valamm.AI" : x.d.brand;
    return (
      <details key={i} className="of">
        <summary><span className="ot"><em className={x.d.brand === "Valamm.AI" ? "val" : ""}>{br}</em><b>{x.d.name}</b><small>{x.why}</small></span><span className="chev" aria-hidden="true">&#9662;</span></summary>
        <div className="ob"><p>{x.d.what}</p><Ul a={x.d.b} /></div>
      </details>
    );
  };
  return (
    <Sec title="What we can offer" col={PHCOL[0]} cls="offers">
      <p className="note" style={{ margin: "0 0 8px" }}>Tap an offer for what it is. Offer the first step, not everything.</p>
      {list.slice(0, 4).map(row)}
      {list.length > 4 ? <details className="mq"><summary>+ {list.length - 4} more</summary>{list.slice(4).map((x, i) => row(x, i + 4))}</details> : null}
    </Sec>
  );
}

export function summaryText(c: Card, ctx: { company?: string; website?: string; person?: string; designation?: string }, heard: Record<number, boolean>, notes: string) {
  const hd = (c.listen || []).filter((_, i) => heard[i]).map((l) => { const sp = splitListen(l); return sp.heard + (sp.so ? " (" + sp.so + ")" : ""); });
  const lines: string[] = [];
  if (ctx.company) lines.push("Company: " + ctx.company + (ctx.website ? " (" + ctx.website + ")" : ""));
  if (ctx.person || ctx.designation) lines.push("Person: " + [ctx.person, ctx.designation].filter(Boolean).join(", "));
  lines.push("Battle card: " + c.id + " " + c.name);
  if (hd.length) lines.push("What I heard: " + hd.join("; "));
  if (notes) lines.push("Notes: " + notes);
  lines.push("Next step: " + c.next);
  return lines.join("\n");
}

function Compass({ c }: { c: Card }) {
  const { s, set } = useStore();
  const [saved, setSaved] = useState("");
  const heard = s.heard[c.id] || {};
  const sum = summaryText(c, s.ctx, heard, s.notes);
  async function save() {
    setSaved("Saving…");
    try {
      const asked = Object.keys(s.ticks).filter((k) => s.ticks[k] && k.startsWith(c.id + "|")).map((k) => k.split("|")[1]);
      await api.saveLog({
        company: s.ctx.company || "", person: s.ctx.person || "", designation: s.ctx.designation || "", cardId: c.id, cardName: c.name,
        heard: (c.listen || []).filter((_, i) => heard[i]).map((l) => splitListen(l).heard), asked, notes: s.notes, summary: sum,
      });
      setSaved("Saved to the VHumans log. Still paste it into Compass today.");
    } catch { setSaved("Could not save right now. Copy the summary instead."); }
  }
  return (
    <Sec title="Log it in Compass today" col={PHCOL[0]}>
      <details className="mq" open>
        <summary>Notes and summary</summary>
        <label className="field" htmlFor="x-notes" style={{ marginTop: 0 }}>
          <span>What did they say? (optional)</span>
          <textarea id="x-notes" placeholder="A few words are enough" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <label className="field" htmlFor="x-sum"><span>Summary to paste into Compass</span><textarea id="x-sum" readOnly value={sum} /></label>
        <CopyBtn text={sum} label="Copy the summary" />
        <button className="copy" type="button" onClick={save}>Save to VHumans log</button>
        {saved ? <p className="note">{saved}</p> : null}
      </details>
    </Sec>
  );
}

function Page({ pg, c, B }: { pg: number; c: Card; B: Beat[] }) {
  const { D, s } = useStore();
  const cx = s.ctx;
  if (pg === 0) {
    const hello = B.find((x) => x.lab === "Say hello, then ask"), news = B.find((x) => x.lab === "A hook from the news"), who = B.find((x) => x.lab === "What we do, in one line");
    const warm = (hello ? [{ q: hello.q! }] : []).concat(phaseQs(B, 0).map((x) => ({ q: x.q! })));
    return (
      <>
        {cx.company ? (
          <details className="bc mq2">
            <summary>Before you speak: read them on LinkedIn</summary>
            <div className="chips" style={{ margin: "10px 0 6px" }}>
              {cx.person ? <a className="chip li" target="_blank" rel="noopener noreferrer" href={liHref("people", cx.person + " " + cx.company)}>{cx.person}</a> : null}
              {LEADERS.map((x) => <a key={x[0]} className="chip li" target="_blank" rel="noopener noreferrer" href={liHref("people", cx.company + " " + x[1])}>{x[0]}</a>)}
            </div>
            <p className="note" style={{ margin: 0 }}>Read the headline and last two posts. Open with one genuine line. Confirm the person by their badge.</p>
          </details>
        ) : null}
        <Sec title="1 · Warm up" col={PHCOL[0]}>
          {hello?.say ? <SayBox txt={hello.say} lab="Say" /> : null}
          <QList items={warm} cap={3} />
          {news ? <p className="hook"><b>News hook:</b> {news.say} <small>({news.src})</small><br />Ask: {news.q}</p> : null}
        </Sec>
        {who ? (
          <Sec title="2 · What we do, in one line" col={PHCOL[1]} cls="hot">
            <p className="br2">{who.bridge}</p>
            <SayBox txt={who.say!} lab="Say" />
            <QList items={[{ q: who.q! }]} />
          </Sec>
        ) : null}
        <Sec title="3 · Big picture" col={PHCOL[2]}><QList items={phaseQs(B, 2).map((x) => ({ q: x.q!, bridge: x.bridge }))} cap={3} /></Sec>
      </>
    );
  }
  if (pg === 1) {
    const hs = s.heard[c.id] || {};
    const lead = (c.listen || []).filter((_, i) => hs[i]).map((l) => splitListen(l).so).filter(Boolean);
    return (
      <>
        <Sec title="4 · Their world" col={PHCOL[3]}>
          <QList items={phaseQs(B, 3).map((x) => ({ q: x.q!, bridge: x.bridge }))} cap={4} />
          <div className="hl">What did you hear? <small>Tap anything they said</small></div>
          <Signals c={c} />
        </Sec>
        <Sec title="5 · Where we could help" col={PHCOL[4]}>
          {lead.length ? <p className="note" style={{ margin: "0 0 8px" }}><b>Lead with:</b> {lead.join("; ")}</p> : null}
          <p className="br2">“Based on what you have told me, here is where we could help.”</p>
          <SayBox txt={c.pitch} lab="30-second pitch" />
          <CopyBtn text={c.pitch} label="Copy the pitch" />
          <div className="hl" style={{ marginTop: 12 }}>{c.storiesTitle} <small>Say “for example”. Illustrations, not customer cases.</small></div>
          {c.stories.map((x, i) => <div key={i} className="story"><b>{x.h}</b>{x.t}</div>)}
        </Sec>
        <Offers c={c} />
        <Sec title="Go deeper" col={PHCOL[5]}><QList items={phaseQs(B, 4).map((x) => ({ q: x.q!, bridge: x.bridge }))} cap={3} /></Sec>
      </>
    );
  }
  const objs = (o: [string, string][]) => o.map((x, i) => <div key={i}><div className="q1">{x[0]}</div><div>{x[1]}</div></div>);
  return (
    <>
      <Sec title="If they push back" col="#D8352F">
        <div className="obj">
          {objs(c.obj.slice(0, 3))}
          {c.obj.length > 3 ? <details className="mq"><summary>+ {c.obj.length - 3} more pushbacks</summary><div className="obj">{objs(c.obj.slice(3))}</div></details> : null}
        </div>
      </Sec>
      <Sec title="Facts and terms" col="#148A78">
        <div className="stats">{c.stats.slice(0, 2).map((x, i) => <div key={i} className="stat"><div className="n">{x.n}</div><div className="t">{x.t}<span className="s">{x.s}</span></div></div>)}</div>
        <div className="jar" style={{ marginTop: 10 }}>{c.jargon.slice(0, 4).map((j, i) => <div key={i}><b>{j[0]}</b>{j[1]}</div>)}</div>
      </Sec>
      <Sec title="Next step" col={PHCOL[5]} cls="hot">
        <SayBox txt={c.next} lab="Your ask" />
        <SayBox txt={c.close} lab="Closing line" />
        <div className="hl" style={{ marginTop: 12 }}>Remember</div>
        <Pairs g={guards(D, c).slice(0, 2)} />
      </Sec>
      <Compass c={c} />
    </>
  );
}

const TABS: [string, string][] = [["obj", "Pushback"], ["jar", "Jargon"], ["facts", "Facts"], ["ppl", "People"], ["cards", "Cards"], ["full", "Full card"]];

function FullCard({ c }: { c: Card }) {
  const { D } = useStore();
  const h = (t: string) => <h3 style={{ margin: "18px 0 0", color: "var(--coral)" }}>{t}</h3>;
  return (
    <>
      {h("1 · Open")}
      <div className="blk"><h3>Who they are</h3><p>{c.sub}</p></div>
      <div className="blk"><h3>What is on their mind</h3><Ul a={c.care} /></div>
      <div className="blk hot"><h3>Your hello</h3><p className="say">{c.hello}</p></div>
      <div className="blk"><h3>Questions from the card</h3><ol className="qs" style={{ margin: 0 }}>{c.open.map((q, i) => <li key={i}><span className="n">{i + 1}</span><span>{q}</span></li>)}</ol></div>
      <div className="blk"><h3>Listen for these signals</h3><Ul a={c.listen} /></div>
      {h("2 · Relevance")}
      <div className="blk hot"><h3>Why we are talking</h3><p className="say">{c.why}</p></div>
      <div className="blk"><h3>By the numbers</h3><div className="stats">{c.stats.map((x, i) => <div key={i} className="stat"><div className="n">{x.n}</div><div className="t">{x.t}<span className="s">{x.s}</span></div></div>)}</div></div>
      <div className="blk news"><h3>In the news</h3>{c.news.map((n, i) => <p key={i}>{n.t} <small>({n.s})</small></p>)}</div>
      {h("3 · Pitch")}
      <div className="blk hot"><h3>Your 30-second pitch</h3><p className="say">{c.pitch}</p></div>
      <div className="blk"><h3>{c.storiesTitle}</h3>{c.stories.map((x, i) => <div key={i} className="story"><b>{x.h}</b>{x.t}</div>)}</div>
      {h("4 · Follow-up")}
      <div className="blk obj"><h3>If they say…</h3>{c.obj.map((x, i) => <div key={i}><div className="q1">{x[0]}</div><div>{x[1]}</div></div>)}</div>
      <div className="blk"><h3>Follow-up questions</h3><Ul a={c.follow} /></div>
      <div className="blk"><h3>Jargon in plain English</h3><div className="jar">{c.jargon.map((j, i) => <div key={i}><b>{j[0]}</b>{j[1]}</div>)}</div></div>
      {h("5 · Next step")}
      <div className="blk hot"><h3>Your ask (next step)</h3><p className="say">{c.next}</p></div>
      <div className="blk"><h3>Closing line</h3><p className="say"><b>{c.close}</b></p></div>
      <div className="blk"><h3>Remember</h3><Pairs g={guards(D, c)} /></div>
    </>
  );
}

function HelpSheet({ c, whyList, onClose }: { c: Card; whyList: string[]; onClose: () => void }) {
  const { D, s, openCard } = useStore();
  const [tab, setTab] = useState("obj");
  const byId = Object.fromEntries(D.cards.map((k) => [k.id, k]));
  const switchTo = (id: string) => { onClose(); openCard(id, s.pg); window.scrollTo(0, 0); };
  let body: ReactNode = null;
  if (tab === "obj") body = <div className="obj">{c.obj.map((x, i) => <div key={i}><div className="q1">{x[0]}</div><div>{x[1]}</div></div>)}</div>;
  else if (tab === "jar") body = <div className="jar">{c.jargon.map((j, i) => <div key={i}><b>{j[0]}</b>{j[1]}</div>)}</div>;
  else if (tab === "facts") body = (
    <>
      <div className="stats">{c.stats.map((x, i) => <div key={i} className="stat"><div className="n">{x.n}</div><div className="t">{x.t}<span className="s">{x.s}</span></div></div>)}</div>
      <div className="news" style={{ marginTop: 14 }}>{c.news.map((n, i) => <p key={i}>{n.t} <small>({n.s})</small></p>)}</div>
    </>
  );
  else if (tab === "ppl") {
    const role = s.ctx.role || "", qs = role ? D.qb.ROLE[role] : null;
    body = (
      <>
        <div className="blk" style={{ marginTop: 0 }}>
          <h3>LinkedIn</h3>
          {s.ctx.company || s.ctx.person ? <LiChips person={s.ctx.person} company={s.ctx.company} leaders label={false} /> : <p>Add the company or the person on the Find screen to get LinkedIn links.</p>}
          <p className="note" style={{ margin: "8px 0 0" }}>These open a LinkedIn search. We cannot read or verify profiles, so confirm by badge. Use public information only.</p>
        </div>
        {qs ? <div className="blk hot"><h3>For a {ROLELAB[role] || role}</h3><Ul a={qs} /></div> : null}
        <div className="blk">
          <h3>If their designation is…</h3>
          {D.desig.map((d) => (
            <div key={d[0]} className="desig"><b>{d[0]}</b>{d[1].split(/,\s*/).map((id) => <button key={id} type="button" onClick={() => switchTo(id)}>{id}</button>)}</div>
          ))}
        </div>
      </>
    );
  } else if (tab === "cards") {
    const alts = s.rank.filter((x) => x.id !== c.id).slice(0, 5);
    body = (
      <>
        {whyList.length ? <div className="blk" style={{ margin: "0 0 12px" }}><h3>Why this card</h3><div className="why" style={{ margin: 0 }}>{whyList.map((w) => <span key={w}>{w}</span>)}</div></div> : null}
        <p className="note" style={{ margin: "0 0 10px" }}>Switch card if the conversation moves. You stay on the same page.</p>
        {alts.length ? alts.map((x) => {
          const k = byId[x.id];
          return <button key={x.id} className="item" type="button" onClick={() => switchTo(x.id)}><span className="no" style={{ background: PARTCOL[k.part] || "#6A38D8" }}>{x.id}</span><span>{k.name}<small>{(x.reasons || [])[0] || k.cat}</small></span></button>;
        }) : <p className="note">Use All cards from the Start screen to pick another.</p>}
      </>
    );
  } else body = <FullCard c={c} />;
  return (
    <div className="sheet">
      <div className="sheetbg" onClick={onClose} />
      <div className="sheetpanel" role="dialog" aria-modal="true" aria-label="Help for this conversation">
        <div className="sheethead">
          <div className="tabs">{TABS.map(([k, l]) => <button key={k} type="button" className={k === tab ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
          <button className="chipbtn" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="sheetbody">{body}</div>
      </div>
    </div>
  );
}

export default function CardView() {
  const { s, set, beats, go, back, openReport, resetAll } = useStore();
  const [sheet, setSheet] = useState(false);
  const c = s.card!;
  const pg = Math.max(0, Math.min(2, s.pg || 0));
  const col = PARTCOL[c.part] || "#6A38D8";
  const ctxLine = [s.ctx.company, s.ctx.designation, s.ctx.person].filter(Boolean).join(" · ");
  const seen: Record<string, 1> = {};
  const whyList = (s.reasonsById[c.id] || []).concat(s.extra || []).filter((w) => (seen[w] ? false : (seen[w] = 1))).slice(0, 4);
  const toPage = (p: number) => { set({ pg: p }); window.scrollTo(0, 0); };
  function step(d: number) {
    if (d > 0 && pg >= 2) { resetAll(); go("start"); return; }
    if (d < 0 && pg === 0) { back(); return; }
    toPage(pg + d);
  }
  return (
    <>
      <section className="view hascard">
        <div className="cardhead">
          <span className="badge" style={{ background: col, color: "#fff" }}>Card {c.id} · {c.cat}</span>
          <h2>{c.name}</h2>
          {ctxLine ? <div className="ctx">{ctxLine}</div> : null}
          {s.ctx.company || s.ctx.person ? (
            <div className="chips">
              {s.ctx.person ? <a className="chip li" target="_blank" rel="noopener noreferrer" href={liHref("people", (s.ctx.person + " " + (s.ctx.company || "")).trim())}>{s.ctx.person}</a> : null}
              {s.ctx.company ? <a className="chip li" target="_blank" rel="noopener noreferrer" href={liHref("companies", s.ctx.company)}>{s.ctx.company}</a> : null}
              {s.ctx.company ? <button type="button" className="chip pick" onClick={() => openReport()}>Market Insight Report</button> : null}
            </div>
          ) : null}
          {whyList.length ? <div className="why">{whyList.map((w) => <span key={w}>{w}</span>)}</div> : null}
        </div>
        <div className="phases">
          {PAGES.map((p, k) => (
            <button key={p} type="button" className={k === pg ? "on" : ""} style={{ "--pc": PHCOL[k * 2] } as CSSProperties} onClick={() => toPage(k)}><span>{k + 1}</span>{p}</button>
          ))}
        </div>
        <div className="prog" aria-hidden="true"><i style={{ width: Math.round(((pg + 1) / 3) * 100) + "%" }} /></div>
        <div id="x-body"><Page pg={pg} c={c} B={beats} /></div>
      </section>
      <nav className="stepnav" aria-label="Conversation controls">
        <div className="in">
          <button className="cta ghost" type="button" onClick={() => step(-1)}>{pg === 0 ? "← Back" : "← Page " + pg}</button>
          <button className="helpbtn" type="button" onClick={() => setSheet(true)}>Help</button>
          <button className="cta" type="button" onClick={() => step(1)}>{pg === 2 ? "Done. Start over" : "Next page →"}</button>
        </div>
      </nav>
      {sheet ? <HelpSheet c={c} whyList={whyList} onClose={() => setSheet(false)} /> : null}
    </>
  );
}
