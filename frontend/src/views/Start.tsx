import { useMemo, useRef, useState } from "react";
import logoVa from "../assets/logo_va.png";
import logoVh from "../assets/logo_vh.png";
import { api, isNotConfigured } from "../lib/api";
import { IND_LABEL } from "../lib/engine";
import { bestLine, readText, toCanvas, toJpeg } from "../lib/ocr";
import { CATCOL, CATLAB, entMatches, looksLikeUrl, search, type IdxEntry } from "../lib/search";
import type { Ent, PhotoId } from "../lib/types";
import { addHist, getHist, setHist } from "../lib/util";
import { useStore } from "../store";

const SearchIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
);
const CamIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);

export function Row({ e, onOpen }: { e: IdxEntry; onOpen: (e: IdxEntry) => void }) {
  return (
    <button className="item" type="button" onClick={() => onOpen(e)}>
      <span>
        <span className="rbadge" style={{ background: CATCOL[e.k] || "#5A5080" }}>{CATLAB[e.k] || e.k}</span><br />
        {e.t}<small>{e.s}</small>
      </span>
    </button>
  );
}

function Best({ e, onOpen }: { e: IdxEntry; onOpen: (e: IdxEntry) => void }) {
  return (
    <div className="best">
      <span className="rbadge" style={{ background: CATCOL[e.k] || "#5A5080" }}>{CATLAB[e.k] || e.k}</span>
      <h3>{e.t}</h3>
      <p className="ans">{e.s}</p>
      {e.say ? <p className="say">{e.say}</p> : null}
      {e.b.length ? <ul>{e.b.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
      <button className="more" type="button" onClick={() => onOpen(e)}>Open the full answer &#8594;</button>
    </div>
  );
}

export default function Start() {
  const { D, IDX, cfg, go, findCompany, pickEntity, openEntry, openReport } = useStore();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [hist, setHistState] = useState<string[]>(getHist());
  const [more, setMore] = useState<{ q: string; list: Ent[]; busy: boolean; msg: string }>({ q: "", list: [], busy: false, msg: "" });
  const [scan, setScan] = useState<{ on: boolean; img: string; cap: string; lines: string[]; best: string; busy?: boolean; id?: PhotoId | null }>({ on: false, img: "", cap: "", lines: [], best: "" });
  const camRef = useRef<HTMLInputElement>(null), galRef = useRef<HTMLInputElement>(null), inRef = useRef<HTMLInputElement>(null);

  const qt = q.trim(), ql = qt.toLowerCase();
  const showRecent = !qt && focus && hist.length > 0;
  const urlFirst = looksLikeUrl(qt);
  const results = useMemo(() => (qt && !urlFirst ? search(IDX, qt) : []), [IDX, qt, urlFirst]);
  const ents = useMemo(() => (qt && !urlFirst ? entMatches(D.ents, qt) : []), [D.ents, qt, urlFirst]);
  const extraEnts = more.q === ql ? more.list : [];
  const histMatch = qt ? hist.filter((x) => { const xl = x.toLowerCase(); return xl !== ql && xl.indexOf(ql) !== -1; }).slice(0, 4) : [];

  function openE(e: IdxEntry) { addHist(qt); setHistState(getHist()); openEntry(e); }
  function company(name: string) { findCompany(name); }
  function pick(e: Ent) { pickEntity(e); }

  async function suggestMore() {
    if (!cfg.llm) { setMore({ q: ql, list: [], busy: false, msg: "Suggestions need the AI service, which is not set up yet." }); return; }
    setMore({ q: ql, list: [], busy: true, msg: "" });
    try {
      const known = ents.map((e) => e[1]);
      const r = await api.entities(qt, known);
      const list: Ent[] = r.list.map((x) => [qt, x.name, x.industry, x.what]);
      setMore({ q: ql, list, busy: false, msg: list.length ? "" : "No more names found. Tap the company row below to look it up." });
    } catch (e) {
      setMore({ q: ql, list: [], busy: false, msg: isNotConfigured(e) ? "Suggestions need the AI service, which is not set up yet." : "Could not get suggestions right now." });
    }
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    setScan({ on: true, img: "", cap: "Loading the photo…", lines: [], best: "" });
    try {
      const c = await toCanvas(file);
      setScan((x) => ({ ...x, img: c.url }));
      // 1. Gemini reads the logo and text, then searches the web to confirm the company
      if (cfg.llm) {
        setScan((x) => ({ ...x, busy: true, cap: cfg.webSearch ? "Reading the logo and searching the web for the company… about 10 to 20 seconds." : "Reading the logo and name…" }));
        try {
          const blob = await toJpeg(c.canvas);
          const id = blob ? await api.identifyPhoto(blob) : null;
          if (id && id.found && id.company) {
            setScan({ on: true, img: c.url, id, lines: id.lines, best: "", busy: false, cap: "" });
            return;
          }
          if (id && id.lines.length) {
            setScan({ on: true, img: c.url, id: null, lines: id.lines, best: bestLine(id.lines), busy: false, cap: "Could not confirm the company from the logo. Tap a name read from the photo, or type it in the search box." });
            return;
          }
        } catch { /* fall back to reading the text on the phone */ }
        setScan((x) => ({ ...x, busy: false }));
      }
      // 2. Fallback: read the text on the phone (TextDetector, then Tesseract)
      const found = await readText(c.canvas, (m) => setScan((x) => ({ ...x, cap: m })), cfg.llm);
      if (!found || !found.length) throw new Error("none");
      const best = bestLine(found);
      setScan({ on: true, img: c.url, lines: found, best, cap: `Best guess: “${best}”. Tap it to find the scenario, or pick another line.` });
    } catch {
      setScan((x) => ({ ...x, cap: "Could not read a name from this photo. Fill the frame with the company name, avoid glare, or type it in the search box." }));
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !qt) return;
    addHist(qt);
    if (ents.length === 1 && !results.length) { pick(ents[0]); return; }
    if (!urlFirst && results.length) openE(results[0].e);
    else if (qt.length >= 3) company(qt);
  }

  const CoRow = ({ main }: { main?: boolean }) => (
    <button className={"rowh" + (main ? " main" : "")} type="button" onClick={() => { addHist(qt); company(qt); }}>
      <span className="hi">&#9906;</span>
      <span>Find the scenario for “{qt}”<small>Company profile check, then the right battle card</small></span>
    </button>
  );

  const bestOn = results.length > 0 && results[0].e.k !== "card" && results[0].e.k !== "q";
  const rest = results.slice(bestOn ? 1 : 0, 11);

  return (
    <section className="view">
      <div className="logos">
        <img className="vh" alt="VirtualizingHumans.AI" src={logoVh} />
        <img className="va" alt="Valamm.AI" src={logoVa} />
      </div>
      <div className="hero">
        <div className="eyebrow">VirtualizingHumans.AI Battle Card</div>
        <h1>Ask Abhay</h1>
      </div>
      <div className="searchbox">
        <SearchIcon />
        <input ref={inRef} type="search" value={q} placeholder="Search, or enter company / URL…" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" aria-label="Search Abhay"
          onChange={(e) => setQ(e.target.value)} onFocus={() => { setHistState(getHist()); setFocus(true); }} onBlur={() => setTimeout(() => setFocus(false), 200)} onKeyDown={onKey} />
        {qt ? <button className="clr" type="button" aria-label="Clear search" onClick={() => { setQ(""); inRef.current?.focus(); }}>&times;</button> : null}
      </div>

      <div id="s-res">
        {showRecent ? (
          <>
            <div className="hlab"><span>Recent searches</span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setHist([]); setHistState([]); }}>Clear</button></div>
            {hist.slice(0, 6).map((x) => <button key={x} className="rowh" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ(x)}><span className="hi">&#8634;</span><span>{x}</span></button>)}
          </>
        ) : null}
        {qt ? (
          <>
            {histMatch.length ? <><div className="hlab"><span>From your history</span></div>{histMatch.map((x) => <button key={x} className="rowh" type="button" onClick={() => setQ(x)}><span className="hi">&#8634;</span><span>{x}</span></button>)}</> : null}
            {urlFirst ? <CoRow main /> : (
              <>
                {ents.length || extraEnts.length ? (
                  <>
                    <div className="hlab"><span>Companies {ents.length > 1 ? "· tap the right one" : ""}</span></div>
                    {ents.concat(extraEnts).map((e) => (
                      <button key={e[1]} className="rowh ent" type="button" onClick={() => pick(e)}>
                        <span className="hi">&#9873;</span>
                        <span>{e[1]}<small>{e[3]}{IND_LABEL[e[2]] ? " · " + IND_LABEL[e[2]] : ""}{extraEnts.includes(e) ? " · suggested by AI, confirm it" : ""}</small></span>
                      </button>
                    ))}
                  </>
                ) : null}
                {qt.length >= 2 ? (
                  <div className="chips">
                    <button type="button" className="chip pick" disabled={more.busy} onClick={suggestMore}>
                      {more.busy ? <><span className="spin" />Asking Gemini…</> : "Suggest more companies"}
                    </button>
                  </div>
                ) : null}
                {more.q === ql && more.msg ? <p className="note">{more.msg}</p> : null}
                {qt.length >= 3 ? <CoRow main={!results.length} /> : null}
                {results.length ? (
                  <>
                    {bestOn ? <Best e={results[0].e} onOpen={openE} /> : null}
                    <div className="grp" style={{ marginTop: 18 }}>{bestOn ? "More matches" : "Matches"}</div>
                    <div className="rl">{rest.map((x) => <Row key={x.e.i} e={x.e} onOpen={openE} />)}</div>
                  </>
                ) : !ents.length ? (
                  <p className="note">Nothing in the battle card matches. If this is a company, tap above. Otherwise try one or two key words, such as “shadow AI”, “MAP” or “agent identity”.</p>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>

      <div className="menu" hidden={!!qt || showRecent}>
        <button className="big coral" type="button" onClick={() => go("company")}>
          <span className="ico"><SearchIcon size={28} /></span>
          <span><span className="t">Who are you meeting?</span><span className="s">Company or website, plus the person.</span></span>
        </button>
        <div className="row2">
          <button className="mid" type="button" onClick={() => camRef.current?.click()}><CamIcon />Take a photo<small>Point at the name board</small></button>
          <button className="mid" type="button" onClick={() => galRef.current?.click()}>Choose a photo<small>From your gallery</small></button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        {scan.on ? (
          <div>
            <div className="preview">
              {scan.img ? <img src={scan.img} alt="Photo of the company name" /> : null}
              {scan.cap ? <div className="cap">{scan.busy ? <span className="spin" /> : null}{scan.cap}</div> : null}
              {scan.id ? (
                <div className="cap">
                  <div className="eyebrow" style={{ marginBottom: 2 }}>Found from the photo{scan.id.live ? " and a web search" : ""}</div>
                  <b style={{ fontSize: 19 }}>{scan.id.company}</b>{scan.id.website ? <span className="note"> · {scan.id.website}</span> : null}
                  {scan.id.what ? <p style={{ margin: "6px 0 0" }}>{scan.id.what}{scan.id.hq ? ` (${scan.id.hq})` : ""}</p> : null}
                  <p className="note" style={{ margin: "6px 0 0" }}>
                    Confidence: {scan.id.confidence}.{scan.id.logo ? ` Logo: ${scan.id.logo.replace(/\.+$/, "")}.` : ""}
                    {scan.id.sources.length ? <> Sources: {scan.id.sources.slice(0, 3).map((s, i) => <span key={s.url}>{i ? " · " : ""}<a className="text-coral font-bold" href={s.url} target="_blank" rel="noopener noreferrer">{(s.title || s.url).slice(0, 30)}</a></span>)}</> : null}
                  </p>
                  <div className="chips">
                    <button type="button" className="chip pick" style={{ background: "var(--coral)", color: "#fff" }} onClick={() => findCompany(scan.id!.company, scan.id!.website)}>Use {scan.id.company}</button>
                    <button type="button" className="chip pick" onClick={() => openReport(scan.id!.company, scan.id!.website)}>Market Insight Report</button>
                  </div>
                  {scan.lines.length ? <p className="note" style={{ margin: "10px 0 0" }}>Other names in the photo:</p> : null}
                </div>
              ) : null}
            </div>
            {scan.lines.length ? (
              <div className="chips">
                {scan.lines.map((l) => <button key={l} type="button" className={"chip" + (l === scan.best ? " pick" : "")} onClick={() => company(l)}>{l}</button>)}
              </div>
            ) : null}
          </div>
        ) : null}
        <button className="big navy" type="button" onClick={() => go("manual")}>
          <span className="ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h6" /></svg></span>
          <span><span className="t">Choose the scenario</span><span className="s">Answer a few quick questions.</span></span>
        </button>
        <div className="row2">
          <button className="mid" type="button" onClick={() => go("all")}>All cards<small>{D.cards.length} scenarios, by group</small></button>
          <button className="mid" type="button" onClick={() => go("ref")}>Quick reference<small>Rules, terms, AWS, AI security</small></button>
        </div>
        <button className="mid w-full mt-3" type="button" onClick={() => openReport()}>
          Market Insight Report<small>One page on any company: products, markets, cloud, India TAM, mandates. Uses AI tokens.</small>
        </button>
        <p className="foot2">Internal use only. Do not show this to customers. Log every conversation in Compass the same day.</p>
      </div>
    </section>
  );
}
