import { CardStyleContext } from "./decks";
import { CardBack } from "./cards";
import { DOOR_PATH, PALACE_PATH } from "./palace-art";

export function WakingScreen({ offline }: { offline: boolean }) {
  return (
    <main className="waking-screen">
      <section className="waking-content">
        <div className="waking-cards" aria-hidden="true">
          <CardStyleContext.Provider
            value={{ deck: "classic", back: "red", setCardStyle: () => {} }}
          >
            <CardBack />
          </CardStyleContext.Provider>
          <div className="waking-front">
            <span />
            <svg viewBox="0 0 100 100">
              <path d={PALACE_PATH} fill="#6B1C26" />
              <path d={DOOR_PATH} fill="#FBF7EE" />
              <rect x="14" y="75.5" width="72" height="5.5" rx="1.5" fill="#6B1C26" />
              <path d="M50 12 v12" stroke="#6B1C26" strokeWidth="1.6" />
              <path d="M50.8 12 l9 3.2 -9 3.2 Z" fill="#E3B54A" />
            </svg>
          </div>
        </div>
        <div role="status">
          <h1>{offline ? "You're offline. Waiting for a connection…" : "Waking the table…"}</h1>
          {!offline && <p>The server naps after 15 quiet minutes. This can take about a minute.</p>}
        </div>
        <div className="waking-pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>
    </main>
  );
}
