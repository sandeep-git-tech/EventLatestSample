import { useEffect, useRef, useState } from "react";
import { api, list, toEvent, toPass, money, date, EVENTS_PATH } from "./ci.js";

const JOURNEY = [
  { id: "view", label: "View event page" },
  { id: "register", label: "Register" },
  { id: "merch", label: "Select merchandise" },
  { id: "pay", label: "Total bill & payment" },
];

/* CI form snippet values (Event > Publishing > Javascript snippets) */
const FORM_ID = import.meta.env.VITE_CI_FORM_ID || "b026da4e-95d7-f111-84e8-6045bd0e0af5";
const FORM_API_URL = import.meta.env.VITE_CI_FORM_API_URL || "https://public-gbr.mkt.dynamics.com/api/v1.0/orgs/f9cc6147-ef48-ef11-accb-6045bdcf35a8/eventmanagement";
const FORM_CACHED_URL = import.meta.env.VITE_CI_FORM_CACHED_URL || `https://assets1-gbr.mkt.dynamics.com/f9cc6147-ef48-ef11-accb-6045bdcf35a8/digitalassets/forms/${FORM_ID}`;
const FORM_LOADER_URL = import.meta.env.VITE_CI_FORM_LOADER_URL || "https://formui-usa1.mkt.dynamics.com/gbr/FormLoader/FormLoader.bundle.js";

/* Your payment gateway (the C# project), no trailing slash. */
const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL || "").replace(/\/$/, "");

/* Display prices only. The gateway recalculates from its own MerchCatalog,
   so keep ids and prices in sync with Services/MerchService.cs. */
const MERCH = [
  { id: "tee", name: "Event T-shirt", price: 20 },
  { id: "mug", name: "Event mug", price: 10 },
  { id: "cap", name: "Event cap", price: 15 },
];

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/* CI gives us the gateway link, e.g. https://gateway/GatewayRedirect/PayWithStripe?purchaseId=... */
function findPurchaseId(redirect) {
  try {
    const u = new URL(redirect);
    const key = [...u.searchParams.keys()].find((k) => k.toLowerCase() === "purchaseid");
    const v = key && u.searchParams.get(key);
    if (v && GUID.test(v)) return v.match(GUID)[0];
  } catch { /* fall through */ }
  const m = String(redirect).match(/purchaseid=([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

/* Match the pass the attendee chose in the CI form (by id or name) to the passes from the API. */
function matchPass(passes, hint) {
  const h = (hint || "").toLowerCase();
  if (!h) return null;
  return (
    passes.find((p) => p.id && h.includes(String(p.id).toLowerCase())) ||
    passes.find((p) => p.name && h.includes(p.name.toLowerCase())) ||
    null
  );
}

export default function Embedding() {
  const [events, setEvents] = useState(null);
  const [event, setEvent] = useState(null);
  const [stage, setStage] = useState(0); // 0 view, 1 CI form, 2 merch, 3 bill + pay
  const [passes, setPasses] = useState(null);
  const [pass, setPass] = useState(null);
  const [passHint, setPassHint] = useState(""); // text from the CI form that identifies the chosen pass
  const [attendee, setAttendee] = useState(null); // captured from the CI form
  const [qty, setQty] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api(EVENTS_PATH)
      .then((d) => setEvents(list(d).map(toEvent)))
      .catch((e) => { setEvents([]); setError(e.message); });
  }, []);

  // Pick the pass automatically once we know the passes and what the attendee chose in the form.
  useEffect(() => {
    if (!passes || !attendee || pass) return;
    const found = matchPass(passes, passHint) || (passes.length === 1 ? passes[0] : null);
    if (found) setPass(found);
  }, [passes, attendee, passHint, pass]);

  const open = (e) => {
    setEvent(e); setStage(0); setQty({}); setError(""); setDone(false);
    setAttendee(null); setPass(null); setPasses(null); setPassHint("");
    api(`/events/${encodeURIComponent(e.key)}/passes`)
      .then((d) => setPasses(list(d).map(toPass)))
      .catch((x) => { setPasses([]); setError(x.message); });
  };
  const back = () => { setEvent(null); setStage(0); };
  const setQ = (id, n) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }));

  const currency = pass?.currency || "USD";
  const lines = [
    pass && { label: `${pass.name} (pass)`, amount: pass.price },
    ...MERCH.filter((m) => qty[m.id] > 0).map((m) => ({ label: `${m.name} × ${qty[m.id]}`, amount: m.price * qty[m.id] })),
  ].filter(Boolean);
  const total = lines.reduce((s, l) => s + l.amount, 0);

  const pay = async () => {
    setBusy(true); setError("");
    try {
      const items = MERCH.filter((m) => qty[m.id] > 0).map((m) => ({ id: m.id, quantity: qty[m.id] }));

      if (items.length && !GATEWAY_URL) {
        throw new Error("Merchandise is not connected yet. Set VITE_GATEWAY_URL in .env.");
      }

      // 1. Register in CI. For a paid pass CI returns the gateway link.
      const res = await api(`/events/${encodeURIComponent(event.key)}/registrations`, {
        method: "POST",
        body: JSON.stringify({ attendees: [{ ...attendee, passId: pass.id }] }),
      });
      const redirect = res.redirectUrl ?? res["redirectUrl "] ?? res.redirectURL;

      // Free pass: no payment step, so merchandise cannot be charged.
      if (!redirect) {
        if (items.length) {
          throw new Error("You are registered, but merchandise can only be charged with a paid pass.");
        }
        setDone(true);
        return;
      }

      // 2. Save the merch order for this purchase so the gateway adds it to the Stripe session.
      if (items.length) {
        const purchaseId = findPurchaseId(redirect);
        if (!purchaseId) throw new Error("Could not find the purchase id in the payment link.");

        const r = await fetch(`${GATEWAY_URL}/api/merch-orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseId, items }),
        });
        if (!r.ok) throw new Error(`Saving merchandise failed (${r.status}).`);
      }

      // 3. Gateway -> Stripe, now with pass + merch in one checkout.
      window.location.href = redirect;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <Journey stage={event && !done ? stage : -1} />
      <section className="panel">
        {error && <p className="err" role="alert">{error}</p>}

        {done && (
          <div className="center">
            <h2>You're registered</h2>
            <p className="muted">A confirmation will be sent to {attendee?.email}.</p>
          </div>
        )}

        {!done && !event && (
          <>
            <h2>Choose an event</h2>
            {events === null && <p className="muted">Loading events…</p>}
            {events?.length === 0 && !error && <p className="muted">No live events found. Publish an event in Customer Insights first.</p>}
            <div className="cards">
              {events?.map((e) => (
                <button key={e.key} className="card" onClick={() => open(e)}>
                  <b>{e.name}</b><span>{[date(e.start), e.location].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {!done && event && stage === 0 && (
          <>
            <h2>{event.name}</h2>
            <p className="muted">{[date(event.start), event.location].filter(Boolean).join(" · ")}</p>
            {event.description && <p>{event.description}</p>}
            <div className="bar">
              <button className="ghost" onClick={back}>All events</button>
              <button className="primary amber" onClick={() => setStage(1)}>Register</button>
            </div>
          </>
        )}

        {!done && event && stage === 1 && (
          <>
            <h2>{event.name}</h2>
            <p className="muted">Enter your details and choose your pass, then click Submit. You will choose merchandise next, and pay at the end.</p>
            <EmbedFrame
              event={event}
              onCaptured={({ hint, ...a }) => { setPass(null); setPassHint(hint); setAttendee(a); setStage(2); }}
            />
            <div className="bar">
              <button className="ghost" onClick={() => setStage(0)}>Back to event</button>
            </div>
          </>
        )}

        {!done && event && stage === 2 && (
          <>
            <h2>Select merchandise</h2>
            <p className="muted">Optional.</p>
            <div className="cards">
              {MERCH.map((m) => (
                <div key={m.id} className={"card" + (qty[m.id] > 0 ? " sel" : "")}>
                  <b>{m.name}</b>
                  <strong className="price">{money(m.price, currency)}</strong>
                  <div className="qty">
                    <button className="ghost" onClick={() => setQ(m.id, (qty[m.id] || 0) - 1)} aria-label="Less">−</button>
                    <span>{qty[m.id] || 0}</span>
                    <button className="ghost" onClick={() => setQ(m.id, (qty[m.id] || 0) + 1)} aria-label="More">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="bar">
              <button className="ghost" onClick={() => setStage(1)}>Back</button>
              <button className="primary" onClick={() => setStage(3)}>Review bill</button>
            </div>
          </>
        )}

        {!done && event && stage === 3 && (
          <>
            <h2>Total bill</h2>
            <p className="muted">{event.name} · {attendee?.firstName} {attendee?.lastName} · {attendee?.email}</p>

            {passes === null && <p className="muted">Loading passes…</p>}
            {passes?.length === 0 && !error && <p className="muted">This event has no passes yet.</p>}

            {/* Only shown if we could not tell which pass was chosen in the form. */}
            {passes?.length > 1 && !pass && (
              <>
                <h3>Confirm your pass</h3>
                <p className="muted">We could not detect the pass you chose in the form.</p>
                <div className="cards">
                  {passes.map((p) => (
                    <button key={p.id} className="card" onClick={() => setPass(p)}>
                      <b>{p.name}</b>
                      <strong className="price">{p.price > 0 ? money(p.price, p.currency) : "Free"}</strong>
                    </button>
                  ))}
                </div>
              </>
            )}

            <table className="bill">
              <tbody>
                {lines.map((l, i) => <tr key={i}><td>{l.label}</td><td>{money(l.amount, currency)}</td></tr>)}
                <tr className="total"><td>Total</td><td>{money(total, currency)}</td></tr>
              </tbody>
            </table>

            <div className="bar">
              <button className="ghost" onClick={() => setStage(2)}>Back</button>
              <button className="primary amber" disabled={!pass || busy} onClick={pay}>
                {busy ? "Processing…" : total > 0 ? `Pay ${money(total, currency)}` : "Complete registration"}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

/* Your CI snippet, rendered from React. On Submit we CANCEL CI's own submission
   (d365mkt-formsubmit is cancellable), read the details and the chosen pass, and move on. */
function EmbedFrame({ event, onCaptured }) {
  const host = useRef(null);
  const cb = useRef(onCaptured);
  cb.current = onCaptured;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";

    const div = document.createElement("div");
    div.setAttribute("data-form-id", FORM_ID);
    div.setAttribute("data-form-api-url", FORM_API_URL);
    div.setAttribute("data-cached-form-url", FORM_CACHED_URL);
    div.setAttribute("data-readable-event-id", event.key);
    el.appendChild(div);

    const script = document.createElement("script");
    script.src = FORM_LOADER_URL;
    el.appendChild(script);

    const readField = (word) => {
      const inputs = [...el.querySelectorAll("input")];
      const hit = inputs.find((i) => `${i.placeholder} ${i.name} ${i.id} ${i.getAttribute("aria-label") || ""}`.toLowerCase().includes(word));
      return (hit?.value || "").trim();
    };

    // Everything in the form that could identify the chosen pass: the payload, plus checked/selected elements.
    const readPassHint = (payload) => {
      let text = "";
      try { text += JSON.stringify(payload ?? {}); } catch { /* ignore */ }
      const chosen = el.querySelectorAll("input:checked, option:checked, [aria-checked='true'], [aria-selected='true'], [class*='selected']");
      chosen.forEach((n) => {
        const label = n.closest("label")?.innerText || n.innerText || "";
        text += ` ${n.value || ""} ${n.id || ""} ${n.getAttribute("data-id") || ""} ${label}`;
      });
      return text;
    };

    const onSubmit = (ev) => {
      ev.preventDefault(); // stop CI from registering and sending the user to payment now
      console.log("CI form payload", ev.detail?.payload);
      cb.current({
        firstName: readField("first"),
        lastName: readField("last"),
        email: readField("email"),
        hint: readPassHint(ev.detail?.payload),
      });
    };

    document.addEventListener("d365mkt-formsubmit", onSubmit);
    return () => {
      document.removeEventListener("d365mkt-formsubmit", onSubmit);
      el.innerHTML = "";
    };
  }, [event.key]);

  return <div ref={host} className="embed" />;
}

function Journey({ stage }) {
  return (
    <ol className="journey" aria-label="Attendee journey">
      {JOURNEY.map((s, i) => (
        <li key={s.id} className={i === stage ? "on" : stage > i ? "done" : ""}>
          <i>{stage > i ? "✓" : i + 1}</i><span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}