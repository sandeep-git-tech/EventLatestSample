import { useEffect, useState } from "react";
import { BASE, TOKEN } from "./ci.js";
import CustomEvent from "./CustomEvent.jsx";
import Embedding from "./Embedding.jsx";

const TABS = [
  { id: "custom", label: "Custom event" },
  { id: "embedding", label: "Embedding" },
];

const fromHash = () => (window.location.hash === "#embedding" ? "embedding" : "custom");

export default function App() {
  const [tab, setTab] = useState(fromHash);

  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = (id) => { window.location.hash = id === "embedding" ? "embedding" : ""; setTab(id); };

  return (
    <div className="app">
      <nav className="nav" aria-label="Registration approach">
        <b className="brand">Event Accelerator</b>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </div>
      </nav>

      <header className="hero">
        <h1>{tab === "custom" ? "Event registration" : "Embedded registration"}</h1>
        <p>{tab === "custom" ? "Choose your event and pass, then pay securely." : "Browse an event, then register, pick sessions and merchandise, and pay in one place."}</p>
      </header>

      <main>
        {!BASE || !TOKEN ? <Setup /> : tab === "custom" ? <CustomEvent /> : <Embedding />}
      </main>
    </div>
  );
}

function Setup() {
  return (
    <section className="panel">
      <h2>Connect to Customer Insights</h2>
      <p className="muted">Copy <code>.env.example</code> to <code>.env</code>, set <code>VITE_CI_API_ENDPOINT</code> and <code>VITE_CI_APP_TOKEN</code>, then restart <code>npm run dev</code>.</p>
    </section>
  );
}
