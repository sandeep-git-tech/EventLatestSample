import { useEffect, useRef, useState } from "react";
import { api, list, toEvent, date, EVENTS_PATH } from "./ci.js";

/* Attendee journey. `where` = who owns the stage:
   "react" = this app, "ci" = inside the embedded CI form, "email" = sent by CI after registering. */
const JOURNEY = [
  { id: "view", label: "View event page", where: "react" },
  { id: "register", label: "Register", where: "ci" },
  { id: "sessions", label: "Select sessions", where: "ci" },
  { id: "merch", label: "Select merchandise", where: "ci" },
  { id: "pay", label: "Payment and checkout", where: "ci" },
  { id: "confirm", label: "Confirmation and QR code", where: "email" },
  { id: "remind", label: "Reminders", where: "email" },
];

/* CI form snippet values (from Event > Publishing > Javascript snippets).
   Override any of them in .env; the defaults below are the ones from your snippet. */
const FORM_ID = import.meta.env.VITE_CI_FORM_ID || "b026da4e-95d7-f111-84e8-6045bd0e0af5";
const FORM_API_URL = import.meta.env.VITE_CI_FORM_API_URL || "https://public-gbr.mkt.dynamics.com/api/v1.0/orgs/f9cc6147-ef48-ef11-accb-6045bdcf35a8/eventmanagement";
const FORM_CACHED_URL = import.meta.env.VITE_CI_FORM_CACHED_URL || `https://assets1-gbr.mkt.dynamics.com/f9cc6147-ef48-ef11-accb-6045bdcf35a8/digitalassets/forms/${FORM_ID}`;
const FORM_LOADER_URL = import.meta.env.VITE_CI_FORM_LOADER_URL || "https://formui-usa1.mkt.dynamics.com/gbr/FormLoader/FormLoader.bundle.js";

export default function Embedding() {
  const [events, setEvents] = useState(null);
  const [event, setEvent] = useState(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(""); // TEMPORARY: raw CI reply for debugging

  useEffect(() => {
    api(EVENTS_PATH)
      .then((d) => { setRaw(JSON.stringify(d, null, 2)); setEvents(list(d).map(toEvent)); }) // TEMPORARY: setRaw
      .catch((e) => { setEvents([]); setError(e.message); });
  }, []);

  const open = (e) => { setEvent(e); setStage(0); };
  const back = () => { setEvent(null); setStage(0); };

  return (
    <>
      <Journey stage={event ? stage : -1} />
      <section className="panel">
        {error && <p className="err" role="alert">{error}</p>}
        {!event
          ? <EventList events={events} error={error} onOpen={open} />
          : stage === 0
            ? <EventPage event={event} onBack={back} onRegister={() => setStage(1)} />
            : <EmbedFrame event={event} onBack={() => setStage(0)} />}
      </section>
      {event && stage > 0 && <p className="muted after">After you pay, a confirmation email with your QR code arrives, followed by event reminders.</p>}
      {/* TEMPORARY: remove after debugging */}
      {events?.length === 0 && raw && <pre style={{ background: "#fff", padding: 12, overflow: "auto", fontSize: 12 }}>{raw}</pre>}
    </>
  );
}

function Journey({ stage }) {
  return (
    <ol className="journey" aria-label="Attendee journey">
      {JOURNEY.map((s, i) => (
        <li key={s.id} className={i === stage ? "on" : stage > i ? "done" : ""} title={s.where === "ci" ? "Handled inside the registration form" : s.where === "email" ? "Sent to you by email" : ""}>
          <i>{stage > i ? "✓" : i + 1}</i><span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function EventList({ events, error, onOpen }) {
  return (
    <>
      <h2>Choose an event</h2>
      {events === null && <p className="muted">Loading events…</p>}
      {events?.length === 0 && !error && <p className="muted">No live events found. Publish an event in Customer Insights first.</p>}
      <div className="cards">
        {events?.map((e) => (
          <button key={e.key} className="card" onClick={() => onOpen(e)}>
            <b>{e.name}</b><span>{[date(e.start), e.location].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* Stage 1: View event page */
function EventPage({ event, onBack, onRegister }) {
  return (
    <>
      <h2>{event.name}</h2>
      <p className="muted">{[date(event.start), event.location].filter(Boolean).join(" · ")}</p>
      {event.description && <p>{event.description}</p>}
      <div className="bar">
        <button className="ghost" onClick={onBack}>All events</button>
        <button className="primary amber" onClick={onRegister}>Register</button>
      </div>
    </>
  );
}

/* Stages 2-5: CI's registration form, rendered by CI's FormLoader script.
   The snippet is: a <div data-form-id=...> plus <script src=FormLoader.bundle.js>.
   In React we create the div, then add the script after it so the loader finds it. */
function EmbedFrame({ event, onBack }) {
  const host = useRef(null);

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

    return () => { el.innerHTML = ""; };
  }, [event.key]);

  return (
    <>
      <h2>{event.name}</h2>
      <p className="muted">Fill in the form to register. Sessions, merchandise and payment appear here if they are set up on the event.</p>
      <div ref={host} className="embed" />
      <div className="bar"><button className="ghost" onClick={onBack}>Back to event</button></div>
    </>
  );
}