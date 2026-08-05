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
    turnCount: 18,
    pickupCount: 2,
    rematchRequested: false,
    animate: true,
    onLobby: vi.fn(),
    onRematch: vi.fn(),
  };

  it("renders an accessible animated winner with 100 confetti pieces", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="WINNER"');
    expect(markup.match(/data-confetti="true"/g)).toHaveLength(100);
  });

  it("renders the animated loser without confetti", () => {
    const markup = renderToStaticMarkup(<ResultOverlay {...props} winner={false} />);
    expect(markup).toContain('aria-label="LOSER"');
    expect(markup).not.toContain('data-confetti="true"');
  });

  it("renders forfeit, static, and rematch-requested states", () => {
    const markup = renderToStaticMarkup(
      <ResultOverlay {...props} winner forfeit animate={false} rematchRequested />,
    );
    expect(markup).toContain("Forfeit");
    expect(markup).toContain("result-overlay--static");
    expect(markup).toContain("Rematch requested");
    expect(markup).toContain("disabled");
  });
});
