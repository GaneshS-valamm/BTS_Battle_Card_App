import { useState } from "react";
import { PeopleBox } from "../components/Controls";
import { useStore } from "../store";

const EXAMPLES = ["Apollo Hospitals", "HDFC Bank", "Tata Motors", "Delhivery", "Airtel"];

export default function Company() {
  const { s, findCompany } = useStore();
  const [name, setName] = useState(s.form.company || "");
  return (
    <section className="view">
      <div className="eyebrow">Find by company</div>
      <h2>Who are you talking to?</h2>
      <p className="lead">Type the company name or its website. Abhay works out what they do and picks the scenarios.</p>
      <label className="field" htmlFor="c-name">
        <span>Company name or website</span>
        <input type="text" id="c-name" value={name} placeholder="Apollo Hospitals, or apollohospitals.com" autoComplete="off" autoCapitalize="words" enterKeyHint="search"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) findCompany(name); }} autoFocus />
      </label>
      <div className="chips">
        {EXAMPLES.map((n) => <button key={n} type="button" className="chip" onClick={() => { setName(n); findCompany(n); }}>{n}</button>)}
      </div>
      <PeopleBox prefix="c" keys={["person", "designation"]} title="The person (optional)" onCompany={(c) => setName(c)} />
      <div className="go"><button className="cta" type="button" disabled={!name.trim()} onClick={() => findCompany(name)}>Find the scenario</button></div>
      <p className="note">Tip: to scan a name board, use Take a photo on the home screen.</p>
    </section>
  );
}
