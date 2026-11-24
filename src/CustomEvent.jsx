import { useEffect, useState } from "react";
import { api, list, toEvent, toPass, money, date, EMAIL, EVENTS_PATH } from "./ci.js";

const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL || "").replace(/\/$/, "");

export default function CustomEvent() {
  if (new URLSearchParams(window.location.search).has("payment")) return <Result />;
  return <Register />;
}

function Register() {
  const [step, setStep] = useState(1);
  const [events, setEvents] = useState(null);
  const [event, setEvent] = useState(null);
  const [passes, setPasses] = useState(null);
  const [pass, setPass] = useState(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Always read live from CI, so renamed events/passes and changed prices show up on reload.
  useEffect(() => {
    api(EVENTS_PATH).then((d) => setEvents(list(d).map(toEvent))).catch((e) => { setEvents([]); setError(e.message); });
  }, []);

  const chooseEvent = (e) => {
    setEvent(e); setPass(null); setPasses(null); setError(""); setStep(2);
    api(`/events/${encodeURIComponent(e.key)}/passes`).then((d) => setPasses(list(d).map(toPass))).catch((x) => { setPasses([]); setError(x.message); });
  };

  const valid = form.firstName.trim() && form.lastName.trim() && EMAIL.test(form.email.trim());

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await api(`/events/${encodeURIComponent(event.key)}/registrations`, {
        method: "POST",
        body: JSON.stringify({ attendees: [{ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), passId: pass.id }] }),
      });
      const redirect = res.redirectUrl ?? res["redirectUrl "] ?? res.redirectURL;
      if (redirect) window.location.href = redirect; // CI -> your gateway -> Stripe
      else setDone(true);                              // free pass: no payment needed
    } catch (e) { setError(e.message); setBusy(false); }
  };

  if (done) return <section className="panel center"><h2>You're registered</h2><p className="muted">A confirmation will be sent to {form.email}.</p></section>;

  return (
    <>
      <ol className="steps" aria-label="Progress">
        {["Event", "Pass", "Your details"].map((t, i) => (
          <li key={t} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""}><i>{step > i + 1 ? "✓" : i + 1}</i>{t}</li>
        ))}
      </ol>

      <section className="panel">
        {error && <p className="err" role="alert">{error}</p>}

        {step === 1 && (
          <>
            <h2>Choose an event</h2>
            {events === null && <p className="muted">Loading events…</p>}
            {events?.length === 0 && !error && <p className="muted">No live events found. Publish an event in Customer Insights first.</p>}
            <div className="cards">
              {events?.map((e) => (
                <button key={e.key} className="card" onClick={() => chooseEvent(e)}>
                  <b>{e.name}</b><span>{[date(e.start), e.location].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Choose a pass</h2>
            <p className="muted">{event.name}</p>
            {passes === null && <p className="muted">Loading passes…</p>}
            {passes?.length === 0 && !error && <p className="muted">This event has no passes yet.</p>}
            <div className="cards">
              {passes?.map((p) => (
                <button key={p.id} className={"card" + (pass?.id === p.id ? " sel" : "")} onClick={() => setPass(p)}>
                  <b>{p.name}</b>
                  <strong className="price">{p.price > 0 ? money(p.price, p.currency) : "Free"}</strong>
                  {p.description && <span>{p.description}</span>}
                </button>
              ))}
            </div>
            <div className="bar">
              <button className="ghost" onClick={() => setStep(1)}>Back</button>
              <button className="primary" disabled={!pass} onClick={() => setStep(3)}>Continue</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Your details</h2>
            <p className="muted">{event.name} · {pass.name} · {pass.price > 0 ? money(pass.price, pass.currency) : "Free"}</p>
            <div className="grid">
              <F t="First name"><input autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></F>
              <F t="Last name"><input autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></F>
            </div>
            <F t="Email"><input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
            <div className="bar">
              <button className="ghost" onClick={() => setStep(2)}>Back</button>
              <button className="primary amber" disabled={!valid || busy} onClick={submit}>
                {busy ? "Registering…" : pass.price > 0 ? "Register and pay" : "Register"}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function Result() {
  const q = new URLSearchParams(window.location.search);
  const ok = q.get("payment") === "success";
  const id = q.get("session_id");

  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ok || !id) return;
    fetch(`${GATEWAY_URL}/GatewayRedirect/Payment/${encodeURIComponent(id)}`)
      .then((r) => { if (!r.ok) throw new Error(`Could not load payment details (${r.status}).`); return r.json(); })
      .then(setD)
      .catch((e) => setErr(e.message));
  }, [ok, id]);

  return (
    <section className="panel center">
      <h2>{ok ? "Payment successful" : "Payment cancelled"}</h2>
      <p className="muted">
        {ok
          ? d?.email
            ? `A confirmation will be sent to ${d.email}.`
            : "Your registration is being confirmed. You'll get an email shortly."
          : "No charge was made. You can register again."}
      </p>

      {err && <p className="err" role="alert">{err}</p>}

      {d && (
        <table className="bill">
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</td>
                <td>{money(l.amount, d.currency)}</td>
              </tr>
            ))}
            <tr className="total"><td>Total paid</td><td>{money(d.total, d.currency)}</td></tr>
            <tr><td>Status</td><td>{d.status}</td></tr>
            <tr><td>Reference</td><td><code>{d.reference}</code></td></tr>
          </tbody>
        </table>
      )}

      <div className="bar">
        <a className="primary" href={window.location.pathname}>{ok ? "Back to events" : "Try again"}</a>
      </div>
    </section>
  );
}

const F = ({ t, children }) => <label className="field"><span>{t}</span>{children}</label>;