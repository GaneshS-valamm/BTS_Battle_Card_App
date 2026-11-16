import { PARTCOL, PARTNAME } from "../lib/flow";
import { CATCOL, CATLAB, search, type IdxEntry } from "../lib/search";
import { useStore } from "../store";
import { Row } from "./Start";

export function AllCards() {
  const { D, openCard, go } = useStore();
  return (
    <section className="view">
      <div className="eyebrow">All battle cards</div>
      <h2>Pick a card</h2>
      {["A", "B", "C", "D", "G", "H", "I"].map((p) => (
        <div key={p}>
          <div className="grp">{PARTNAME[p]}</div>
          <div className="list">
            {D.cards.filter((c) => c.part === p).map((c) => (
              <button key={c.id} className="item" type="button" onClick={() => { openCard(c.id, null, true, "Opened from the list"); go("card"); }}>
                <span className="no" style={{ background: PARTCOL[p] }}>{c.id}</span>
                <span>{c.name}<small>{c.cat}</small></span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function Pairs({ g }: { g: [string, string][] }) {
  return <>{g.map((x, i) => <div key={i} className="pair"><div className="yes"><small>Say this</small>{x[0]}</div><div className="no"><small>Not this</small>{x[1]}</div></div>)}</>;
}

export function RefView() {
  const { D, IDX, openEntry } = useStore();
  const R = D.ref;
  const cats: [string, string][] = [["OFF", "What we offer"], ["SEC", "Our AI security offering"], ["THR", "AI threats in plain words"], ["AWS", "AWS programs"], ["DEF", "Definitions"], ["ORG", "About us and the rules"], ["PLAY", "Scenario playbook"]];
  return (
    <section className="view">
      <div className="eyebrow">Quick reference</div>
      <h2>Keep these handy</h2>
      <details className="acc" open><summary>Say this, not that</summary><div className="body"><Pairs g={R.guard} /></div></details>
      <details className="acc"><summary>Elevator pitches</summary><div className="body">{R.pitches.map((p) => <div key={p[0]}><b>{p[0]}</b><p><i>10 seconds:</i> {p[1]}</p><p><i>30 seconds:</i> {p[2]}</p></div>)}</div></details>
      <details className="acc"><summary>Objection answers</summary><div className="body">{R.objs.map((x, i) => <div key={i} className="obj"><div className="q1">{x[0]}</div><p>{x[1]}</p></div>)}</div></details>
      <details className="acc"><summary>Closing lines</summary><div className="body">{R.closing.map((x, i) => <div key={i}><small className="font-bold uppercase tracking-wider text-muted">{x[0]}</small><p><b>{x[1]}</b></p></div>)}</div></details>
      {R.gloss.map((g) => <details key={g.t} className="acc"><summary>{g.t.replace(/^Glossary \d of \d: /, "Terms: ")}</summary><div className="body">{g.items.map((x) => <div key={x[0]}><b>{x[0]}</b><p>{x[1]}</p></div>)}</div></details>)}
      <details className="acc"><summary>Who to bring in</summary><div className="body">{R.handoff.map((x) => <div key={x[0]}><b>{x[0]}</b><p>{x[1]}</p><p><i>Send them:</i> {x[2]}</p></div>)}<p className="note">Confirm owners with the founder before relying on this list.</p></div></details>
      {cats.map(([k, label]) => {
        const rows = IDX.filter((e) => e.k === k && D.kb.some((b) => b.t === e.t && b.cat === k));
        if (!rows.length) return null;
        return <details key={k} className="acc"><summary>{label}</summary><div className="body"><div className="rl">{rows.map((e) => <Row key={e.i} e={e} onOpen={openEntry} />)}</div></div></details>;
      })}
    </section>
  );
}

export function KbView() {
  const { D, IDX, s, openEntry, openCard, go } = useStore();
  const e = s.kb as IdxEntry;
  const col = CATCOL[e.k] || "#5A5080";
  const byId = Object.fromEntries(D.cards.map((c) => [c.id, c]));
  const more = search(IDX, e.t).filter((x) => x.e.i !== e.i && x.e.k !== "q" && x.e.k !== "fact").slice(0, 4);
  return (
    <section className="view">
      <div className="eyebrow" style={{ color: col }}>{CATLAB[e.k] || e.k}</div>
      <h2>{e.t}</h2>
      <div className="banner">{e.s}</div>
      {e.say ? <div className="blk hot"><h3>You could say</h3><p className="say"><b>{e.say}</b></p></div> : null}
      {e.b.length ? <div className="blk"><h3>Details</h3><ul>{e.b.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null}
      {e.card.length ? (
        <>
          <div className="grp">Related battle cards</div>
          <div className="list">
            {e.card.slice(0, 6).map((id) => {
              const k = byId[id]; if (!k) return null;
              return <button key={id} className="item" type="button" onClick={() => { openCard(id, null, true, "Opened from search"); go("card"); }}><span className="no" style={{ background: PARTCOL[k.part] || "#6A38D8" }}>{id}</span><span>{k.name}<small>{k.title}</small></span></button>;
            })}
          </div>
        </>
      ) : null}
      {more.length ? <><div className="grp">Also related</div><div className="rl">{more.map((x) => <Row key={x.e.i} e={x.e} onOpen={(z) => { openEntry(z); window.scrollTo(0, 0); }} />)}</div></> : null}
    </section>
  );
}
