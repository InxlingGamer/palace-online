import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicGameState } from "@palace/shared";
import { ResultOverlay, SevenRestrictionAlert } from "./feedback";
import { restrictionForViewer } from "./restriction";

describe("seven restriction feedback", () => {
  it("returns a direction only for the affected player", () => {
    const state = {
      you: { id: "A" },
      restriction: { direction: "higher", targetPlayerId: "A" },
    } as PublicGameState;
    expect(restrictionForViewer(state)).toBe("higher");
    expect(
      restrictionForViewer({
        ...state,
        restriction: { ...state.restriction!, targetPlayerId: "B" },
      }),
    ).toBeNull();
  });

  it("renders direct accessible higher and lower instructions", () => {
    expect(renderToStaticMarkup(<SevenRestrictionAlert direction="higher" />)).toContain(
      "PLAY HIGHER THAN 7",
    );
    expect(renderToStaticMarkup(<SevenRestrictionAlert direction="lower" />)).toContain(
      'aria-live="assertive"',
    );
  });
});

describe("result feedback", () => {
  const props = {
    forfeit: false,
    opponentName: "Baby",
    turnCount: 18,
    yourPickups: 2,
    opponentPickups: 3,
    rematchRequested: false,
    opponentWantsRematch: false,
    animate: true,
    onLobby: vi.fn(),
    onRematch: vi.fn(),
  };

  it("renders an accessible animated winner with 100 confetti pieces", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="result-title"');
    expect(markup).toContain('aria-label="WINNER"');
    expect(markup).toContain("result-overlay--animate");
    expect(markup).toContain("You cleared your palace first.");
    expect(markup.match(/data-confetti="true"/g)).toHaveLength(100);
    expect(markup).not.toContain('role="status"');
  });

  it("renders the animated loser without confetti", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner={false} />);
    expect(markup).toContain('aria-label="LOSER"');
    expect(markup).toContain('class="result-name">Baby</span> cleared their palace first.');
    expect(markup).not.toContain('data-confetti="true"');
  });

  it("renders forfeit, static, and rematch-requested states", () => {
    const markup = renderToStaticMarkup(
      <ResultOverlay {...props} winner forfeit animate={false} rematchRequested />,
    );
    expect(markup).toContain("By forfeit");
    expect(markup).toContain('class="result-name">Baby</span> left the table.');
    expect(markup).toContain("result-overlay--static");
    expect(markup).toContain("Rematch requested");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Rematch requested<\/button>/);
  });

  it("renders the loser forfeit explanation", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner={false} forfeit />);
    expect(markup).toContain("By forfeit");
    expect(markup).toContain("The game ended by forfeit.");
  });

  it("renders three labeled game totals", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner />);
    expect(markup).toContain('<dl class="result-stats">');
    expect(markup.match(/<dd>\d+<\/dd>/g)).toEqual(["<dd>18</dd>", "<dd>2</dd>", "<dd>3</dd>"]);
    expect(markup).toContain("<dt>Turns</dt>");
    expect(markup).toContain("<dt>Your pickups</dt>");
    expect(markup).toContain("Baby&#x27;s pickups</dt>");
  });

  it("shows an opponent invitation only before you request a rematch", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner opponentWantsRematch />);
    expect(markup).toContain('class="result-status result-status--invitation" role="status"');
    expect(markup).toContain('class="result-name">Baby</span> wants a rematch');
    const bothRequested = renderToStaticMarkup(
      <ResultOverlay {...props} winner opponentWantsRematch rematchRequested />,
    );
    expect(bothRequested).not.toContain("wants a rematch");
    expect(bothRequested).not.toContain("Waiting for");
  });

  it("shows a waiting status when only you requested a rematch", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner rematchRequested />);
    expect(markup).toContain('class="result-status" role="status"');
    expect(markup).toContain('Waiting for <span class="result-name">Baby</span>…');
    expect(markup).not.toContain("wants a rematch");
  });

  it("disables the rematch action while pending", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner pending />);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Rematch<\/button>/);
  });
});
