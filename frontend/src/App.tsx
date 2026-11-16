import { useEffect, useState } from "react";
import { api, ApiError, setAccessKey } from "./lib/api";
import type { AppConfig, Content } from "./lib/types";
import { StoreProvider, useStore } from "./store";
import CardView from "./views/CardView";
import Check from "./views/Check";
import Company from "./views/Company";
import { AllCards, KbView, RefView } from "./views/Lists";
import Manual from "./views/Manual";
import ReportView from "./views/ReportView";
import Start from "./views/Start";

function Shell() {
  const { view, go, back, openReport } = useStore();
  const inner = view !== "start";
  return (
    <>
      {inner ? (
        <header className="bar">
          <div className="wrap">
            <button className="chipbtn" type="button" aria-label="Go back" onClick={back}>&#8592; Back</button>
            <div className="brand">
              {view === "report" ? <b>VHumans</b> : (
                <button type="button" className="mibtn" onClick={() => openReport()} aria-label="Market Insight Report">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
                  Market Insight
                </button>
              )}
            </div>
            <button className="chipbtn solid" type="button" onClick={() => go("start")}>Start</button>
          </div>
        </header>
      ) : null}
      <main className="app wrap" style={inner ? undefined : { paddingTop: "max(14px, env(safe-area-inset-top))" }}>
        {view === "start" && <Start />}
        {view === "company" && <Company />}
        {view === "check" && <Check />}
        {view === "manual" && <Manual />}
        {view === "card" && <CardView />}
        {view === "all" && <AllCards />}
        {view === "ref" && <RefView />}
        {view === "kb" && <KbView />}
        {view === "report" && <ReportView />}
      </main>
    </>
  );
}

function Boot({ children }: { children: (D: Content, cfg: AppConfig) => React.ReactNode }) {
  const [D, setD] = useState<Content | null>(null);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [err, setErr] = useState<{ msg: string; key?: boolean } | null>(null);
  const [key, setKey] = useState("");
  const load = () => {
    setErr(null);
    Promise.all([api.content(), api.config()])
      .then(([d, c]) => { setD(d); setCfg(c); })
      .catch((e) => setErr(e instanceof ApiError && e.status === 401 ? { msg: "This app needs the team access key.", key: true } : { msg: e instanceof Error ? e.message : "Could not load VHumans." }));
  };
  useEffect(load, []);
  if (D && cfg) return <>{children(D, cfg)}</>;
  return (
    <main className="app wrap">
      <section className="view" style={{ paddingTop: 60, textAlign: "center" }}>
        <h1>VHumans</h1>
        {err ? (
          <>
            <div className="banner warn" style={{ textAlign: "left" }}><b>{err.msg}</b></div>
            {err.key ? (
              <label className="field" style={{ textAlign: "left" }}>
                <span>Access key</span>
                <input type="text" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              </label>
            ) : null}
            <div className="go"><button className="cta" type="button" onClick={() => { if (err.key) setAccessKey(key.trim()); load(); }}>{err.key ? "Continue" : "Try again"}</button></div>
          </>
        ) : <p className="note"><span className="spin" />Loading the battle cards…</p>}
      </section>
    </main>
  );
}

export default function App() {
  return <Boot>{(D, cfg) => <StoreProvider D={D} cfg={cfg}><Shell /></StoreProvider>}</Boot>;
}
