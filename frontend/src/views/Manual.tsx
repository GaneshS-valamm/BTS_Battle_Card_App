import { Ctl, PeopleBox } from "../components/Controls";
import { useStore } from "../store";

export default function Manual() {
  const { set, serve } = useStore();
  return (
    <section className="view">
      <div className="eyebrow">Choose the scenario</div>
      <h2>Tell us what you know</h2>
      <p className="lead">Nothing is compulsory. Skip what you do not know.</p>
      {(["role", "industry", "interest", "ctype", "cloud", "pain"] as const).map((k, i) => <Ctl key={k} k={k} prefix="m" num={i + 1} />)}
      <PeopleBox prefix="m" keys={["company", "person", "designation"]} leaders />
      <details className="more">
        <summary>Add more details (optional)</summary>
        {(["website", "size", "notes"] as const).map((k) => <Ctl key={k} k={k} prefix="m" />)}
      </details>
      <div className="go"><button className="cta" type="button" onClick={() => serve(true)}>Show the battle card</button></div>
      <p className="note" style={{ textAlign: "center" }}>
        <button className="chipbtn" type="button" onClick={() => { set({ form: {} }); window.scrollTo(0, 0); }}>Clear all answers</button>
      </p>
    </section>
  );
}
