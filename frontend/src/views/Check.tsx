import { useState } from "react";
import { Ctl, PeopleBox } from "../components/Controls";
import { IND_LABEL } from "../lib/engine";
import { publicLinks } from "../lib/util";
import { useStore } from "../store";

function AiBox() {
  const { s, set, setForm, runAnalysis, cfg } = useStore();
  const [desc, setDesc] = useState(s.desc);
  const ai = s.ai, p = s.co;
  if (ai && ai.known) return null;
  if (s.aiBusy) {
    return (
      <div className="aibox"><div className="banner"><span className="spin" /><b>Reading up on {p?.display || "the company"}…</b> {cfg.webSearch ? "Searching the web, about 15 to 30 seconds." : "This takes a few seconds."}</div></div>
    );
  }
  const lowConf = ai && (ai.recognised === false || ai.conf === "low");
  return (
    <div className="aibox">
      {ai && ai.what ? (
        <div className="banner">
          <b>What they do:</b> {ai.what}{ai.hq ? ` (${ai.hq})` : ""}
          <div className="sub">
            {lowConf ? "Low confidence: VHumans could not place this one clearly. " : ""}
            {ai.live ? (
              <>From a live web search.{ai.sources && ai.sources.length ? <> Sources: {ai.sources.map((x, i) => <span key={x.url}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noopener noreferrer">{(x.title || x.url).slice(0, 40)}</a></span>)}</> : null} Confirm it when you speak to them.</>
            ) : "This comes from Gemini’s general knowledge of public information, not a live web search. Confirm it when you speak to them."}
          </div>
        </div>
      ) : ai && ai.ai ? (
        <div className="banner"><b>Could not place {p?.display || "this company"}.</b> Add one line about them below, or pick the type yourself.</div>
      ) : ai && ai.notConfigured ? (
        <div className="banner warn"><b>The AI lookup is not set up yet.</b> VHumans used the name and website words only. Open their public profile below, paste what they do, and tap Analyse.</div>
      ) : (
        <div className="banner warn"><b>{ai?.error ? "The AI lookup failed: " + ai.error : "VHumans could not look this company up."}</b> It used the name and website words only. Open their public profile below, paste what they do, and tap Analyse.</div>
      )}
      {ai && ai.sugg.length ? (
        <>
          <div className="sub" style={{ marginTop: 12, fontWeight: 700 }}>Looks like… tap to confirm</div>
          <div className="chips">
            {ai.sugg.map((x, i) => (
              <button key={x.l} type="button" className="chip pick" onClick={() => { setForm(x.set); set((st) => ({ ai: st.ai ? { ...st.ai, sugg: st.ai.sugg.filter((_, j) => j !== i) } : st.ai })); }}>{x.l}</button>
            ))}
          </div>
        </>
      ) : null}
      <div className="sub" style={{ marginTop: 14, fontWeight: 700 }}>Public profile</div>
      <div className="chips">
        {publicLinks(p?.display || "", p?.domain || "").map(([t, href]) => <a key={href} className="chip" href={href} target="_blank" rel="noopener noreferrer">{t} &#8599;</a>)}
      </div>
      <label className="field" htmlFor="k-desc">
        <span>What do they do? <span className="hint">· paste their website tagline or LinkedIn About</span></span>
        <textarea id="k-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="For example: We secure enterprise AI agents against prompt injection and data leaks" />
      </label>
      <div className="chips"><button type="button" className="chip pick" onClick={() => { if (desc.trim()) runAnalysis(desc.trim()); }}>Analyse this</button></div>
    </div>
  );
}

export function ReportCard() {
  const { openReport, cfg } = useStore();
  return (
    <div className="repcard" id="k-report">
      <div className="eyebrow" style={{ color: "#CDB8FF" }}>Optional · uses AI tokens</div>
      <h3>Market Insight Report</h3>
      <p>One page on the company: what they sell, where, through whom, their IT and cloud, India market size, government mandates, recent signals and where we can help.</p>
      {!cfg.llm ? <p style={{ fontWeight: 700 }}>The AI service is not set up yet. You can still open a report saved earlier.</p> : null}
      <button type="button" className="cta" onClick={() => openReport()}>Market Insight Report</button>
    </div>
  );
}

export default function Check() {
  const { s, setForm, serve } = useStore();
  const r = s.detect || { list: [], ambiguous: [], top: null, known: false };
  const picked = s.ai?.picked;
  return (
    <section className="view">
      <div className="eyebrow">Check and sharpen</div>
      <h2>{s.form.company || "Company"}</h2>
      <div className="banner">
        {r.ambiguous.length >= 2 ? (
          <>
            <b>More than one business fits.</b> Tap the one you are speaking to.
            <div className="chips">
              {r.ambiguous.map((i) => <button key={i} type="button" className={"chip pick"} aria-pressed={s.form.industry === i} style={s.form.industry === i ? { background: "var(--coral)", color: "#fff" } : undefined} onClick={() => setForm({ industry: i })}>{IND_LABEL[i]}</button>)}
            </div>
          </>
        ) : picked ? (
          <><b>{picked[1]}</b>: {picked[3]}. {IND_LABEL[picked[2]] ? <>Industry set to <b>{IND_LABEL[picked[2]]}</b>. </> : null}Change anything below that is wrong. This is treated as an established company, so AWS credits (startups only) are not shown.</>
        ) : r.top ? (
          <><b>Looks like {IND_LABEL[r.top.ind]}.</b> Matched on {r.top.why.map((w) => "“" + w + "”").join(", ")}. Change it below if that is wrong.{r.known ? " This is treated as an established company, so AWS credits (startups only) are not shown." : ""}</>
        ) : (
          <><b>Not in VHumans’s list of known companies.</b> See what VHumans found below, and change anything that is wrong.</>
        )}
      </div>
      <AiBox />
      <PeopleBox prefix="k" keys={["person", "designation"]} leaders />
      {(["industry", "ctype", "role", "interest", "cloud"] as const).map((k) => <Ctl key={k} k={k} prefix="k" />)}
      <details className="more"><summary>Add more details (optional)</summary><Ctl k="website" prefix="k" /></details>
      <div className="go"><button className="cta" type="button" onClick={() => serve()}>Show the battle card</button></div>
      <p className="note">Every extra detail makes the card more specific. None are required.</p>
      <ReportCard />
    </section>
  );
}
