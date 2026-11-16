import { useState } from "react";
import { classify, IND_LABEL, roleFromText } from "../lib/engine";
import { ROLELAB } from "../lib/flow";
import { DEF, liLinks, OPT, parseHeadline, type FieldKey } from "../lib/util";
import { useStore } from "../store";

/** One question bound to the shared answers (form). */
export function Ctl({ k, prefix, num }: { k: FieldKey; prefix: string; num?: number }) {
  const { s, setForm } = useStore();
  const d = DEF[k], id = `${prefix}-${k}`, v = (s.form[k] as string) || "";
  const lab = (
    <>
      {num ? <span className="num">{num}</span> : null}
      <span>{d.l}{d.hint ? <span className="hint"> · {d.hint}</span> : null}</span>
    </>
  );
  if (d.k === "select") {
    return (
      <div className="q">
        <label htmlFor={id}>{lab}</label>
        <select id={id} value={v} onChange={(e) => setForm({ [k]: e.target.value })}>
          <option value="">Choose (optional)</option>
          {OPT[k].map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
        </select>
      </div>
    );
  }
  if (d.k === "tiles") {
    return (
      <div className="q">
        <div className="lab">{lab}</div>
        <div className="tiles">
          {OPT[k].map((o) => (
            <button key={o[0]} type="button" className={"tile" + (v === o[0] ? " on" : "")} aria-pressed={v === o[0]}
              onClick={() => setForm({ [k]: v === o[0] ? "" : o[0] })}>{o[1]}</button>
          ))}
        </div>
      </div>
    );
  }
  if (d.k === "text") {
    return (
      <label className="field" htmlFor={id}>
        <span>{d.l}</span>
        <input type="text" id={id} value={v} placeholder={d.ph || ""} autoComplete="off" onChange={(e) => setForm({ [k]: e.target.value })} />
      </label>
    );
  }
  return (
    <label className="field" htmlFor={id}>
      <span>{d.l}</span>
      <textarea id={id} value={v} placeholder={d.ph || ""} onChange={(e) => setForm({ [k]: e.target.value })} />
    </label>
  );
}

export function LiChips({ person, company, leaders, compact, label = true }: { person?: string; company?: string; leaders?: boolean; compact?: boolean; label?: boolean }) {
  const links = liLinks({ person, company }, leaders, compact);
  if (!links.length) return null;
  return (
    <div className="chips">
      {label ? <div className="lilabel">Opens a LinkedIn search. We cannot read or verify profiles, so confirm by badge.</div> : null}
      {links.map(([t, href]) => <a key={href} className="chip li" target="_blank" rel="noopener noreferrer" href={href}>{t}</a>)}
    </div>
  );
}

/** The person: name, designation, and a pasted LinkedIn headline that fills both. */
export function PeopleBox({ prefix, keys, title = "The person", leaders, onCompany }: { prefix: string; keys: FieldKey[]; title?: string; leaders?: boolean; onCompany?: (c: string) => void }) {
  const { s, set, setForm } = useStore();
  const [hl, setHl] = useState("");
  const [msg, setMsg] = useState("");
  function useHeadline() {
    const p = parseHeadline(hl), got: string[] = [];
    if (!p.designation && !p.company) { setMsg("Paste a headline first."); return; }
    const patch: Record<string, string> = {};
    if (p.designation) { patch.designation = p.designation; got.push("designation: " + p.designation); const r = roleFromText(p.designation); if (r) { patch.role = r; got.push("role: " + (ROLELAB[r] || r)); } }
    if (p.company) {
      patch.company = p.company; got.push("company: " + p.company);
      const cl = classify(p.company);
      if (cl.top && cl.ambiguous.length < 2) { patch.industry = cl.top.ind; got.push("industry: " + IND_LABEL[cl.top.ind]); }
      if (prefix === "k") set({ detect: cl });
      onCompany?.(p.company);
    }
    setForm(patch);
    setMsg("Read: " + got.join("; ") + ". " + (prefix === "c" ? "Tap Find the scenario." : "The card choices below use it."));
  }
  return (
    <div className="pplbox">
      <h3>{title}</h3>
      {keys.map((k) => <Ctl key={k} k={k} prefix={prefix} />)}
      <label className="field" htmlFor={`${prefix}-hl`}>
        <span>Paste their LinkedIn headline <span className="hint">· optional</span></span>
        <textarea id={`${prefix}-hl`} rows={2} value={hl} onChange={(e) => setHl(e.target.value)} placeholder="For example: Chief Information Security Officer at HDFC Bank | Cyber risk" />
      </label>
      <div className="chips"><button type="button" className="chip pick" onClick={useHeadline}>Use the headline</button></div>
      {msg ? <div className="note">{msg}</div> : null}
      <LiChips person={s.form.person} company={s.form.company} leaders={leaders} />
    </div>
  );
}
