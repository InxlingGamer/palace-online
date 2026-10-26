import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionEnvelope, ActionResult, PublicGameState } from "@palace/shared";
import { createActionSender, shouldAcceptSnapshot, type ActionSocket } from "./action-sender";

const state = { roomCode: "ABC234", revision: 4, turnSeq: 2 } as PublicGameState;
const accepted: ActionResult = { actionId: "cached", accepted: true, revision: 5 };
function fakeSocket() {
  const listeners = new Set<() => void>();
  const emit = vi.fn<(event: string, envelope: ActionEnvelope) => Promise<ActionResult>>();
  const socket = {
    connected: true as boolean,
    timeout: vi.fn(() => ({ emitWithAck: emit })),
    on: vi.fn((_event, listener: () => void) => {
      listeners.add(listener);
    }),
    off: vi.fn((_event, listener: () => void) => {
      listeners.delete(listener);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  } satisfies ActionSocket;
  return {
    socket,
    emit,
    reconnect: () => {
      socket.connected = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("action sender", () => {
  it("allows only one in-flight action and sends both versions", async () => {
    const { socket, emit } = fakeSocket();
    let resolve!: (value: ActionResult) => void;
    emit.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = vi.fn();
    const sender = createActionSender(socket, pending, vi.fn());
    const first = sender.send(state, { type: "DRAW_CARD" });
    expect(await sender.send(state, { type: "DRAW_CARD" })).toBeUndefined();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toMatchObject({ expectedTurn: 2, expectedRevision: 4 });
    expect(socket.timeout).toHaveBeenCalledWith(8000);
    resolve(accepted);
    await first;
    expect(pending.mock.calls).toEqual([[true], [false]]);
  });

  it("retries the identical envelope once after reconnect", async () => {
    const { socket, emit, reconnect } = fakeSocket();
    emit.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(accepted);
    const sender = createActionSender(socket, vi.fn(), vi.fn());
    const sent = sender.send(state, { type: "DRAW_CARD" });
    await Promise.resolve();
    expect(emit).toHaveBeenCalledTimes(1);
    reconnect();
    expect(await sent).toEqual(accepted);
    expect(emit.mock.calls[0]![1]).toBe(emit.mock.calls[1]![1]);
  });

  it("classifies stale state as info and other errors as errors", async () => {
    const { socket, emit } = fakeSocket();
    const notice = vi.fn();
    const sender = createActionSender(socket, vi.fn(), notice);
    emit.mockResolvedValueOnce({
      ...accepted,
      accepted: false,
      error: { code: "STALE_STATE", message: "server conflict" },
    });
    await sender.send(state, { type: "PICK_UP_PILE" });
    expect(notice).toHaveBeenLastCalledWith({
      tone: "info",
      message: "The table changed — try again.",
    });
    emit.mockResolvedValueOnce({
      ...accepted,
      accepted: false,
      error: { code: "HAND_FULL", message: "Full" },
    });
    await sender.send(state, { type: "DRAW_CARD" });
    expect(notice).toHaveBeenLastCalledWith({ tone: "error", message: "Full" });
  });

  it("handles a second rejection without rejecting its promise and releases pending", async () => {
    const { socket, emit, reconnect } = fakeSocket();
    emit.mockRejectedValue(new Error("disconnected"));
    const notice = vi.fn();
    const pending = vi.fn();
    const sender = createActionSender(socket, pending, notice);
    const sent = sender.send(state, { type: "DRAW_CARD" });
    await Promise.resolve();
    reconnect();
    await expect(sent).resolves.toBeUndefined();
    expect(emit).toHaveBeenCalledTimes(2);
    expect(notice).toHaveBeenLastCalledWith({
      tone: "info",
      message: "Connection lost — your move may not have been sent.",
    });
    expect(pending).toHaveBeenLastCalledWith(false);
  });

  it("bounds reconnect waiting and cleans up when disposed", async () => {
    vi.useFakeTimers();
    const { socket, emit } = fakeSocket();
    emit.mockRejectedValue(new Error("timeout"));
    const notice = vi.fn();
    const sender = createActionSender(socket, vi.fn(), notice);
    const sent = sender.send(state, { type: "DRAW_CARD" });
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(sent).resolves.toBeUndefined();
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ tone: "info" }));
    const next = sender.send(state, { type: "DRAW_CARD" });
    await Promise.resolve();
    sender.dispose();
    await expect(next).resolves.toBeUndefined();
    expect(socket.off).toHaveBeenCalled();
    expect(await sender.send(state, { type: "READY" })).toBeUndefined();
  });

  it("ignores older snapshots only for the same room", () => {
    expect(shouldAcceptSnapshot(state, { ...state, revision: 3 })).toBe(false);
    expect(shouldAcceptSnapshot(state, { ...state, revision: 4 })).toBe(true);
    expect(shouldAcceptSnapshot(state, { ...state, roomCode: "DEF234", revision: 0 })).toBe(true);
  });
});
