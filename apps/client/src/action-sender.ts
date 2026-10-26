import type { ActionEnvelope, ActionResult, GameCommand, PublicGameState } from "@palace/shared";

export interface ActionSocket {
  connected: boolean;
  timeout(ms: number): {
    emitWithAck(event: string, envelope: ActionEnvelope): Promise<ActionResult>;
  };
  on(event: "connect", listener: () => void): unknown;
  off(event: "connect", listener: () => void): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

export interface ActionNotice {
  message: string;
  tone: "info" | "error";
}

export function createActionSender(
  socket: ActionSocket,
  onPending: (pending: boolean) => void,
  onNotice: (notice: ActionNotice | null) => void,
) {
  let pending = false;
  let disposed = false;
  let cancelReconnect: (() => void) | undefined;

  function reconnect(): Promise<void> {
    if (socket.connected) socket.disconnect();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        socket.off("connect", connected);
        cancelReconnect = undefined;
      };
      const connected = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Reconnect failed"));
      };
      const timer = setTimeout(failed, 30_000);
      cancelReconnect = failed;
      socket.on("connect", connected);
      try {
        socket.connect();
      } catch {
        failed();
      }
    });
  }

  return {
    get pending() {
      return pending;
    },
    async send(state: PublicGameState, command: GameCommand): Promise<ActionResult | undefined> {
      if (pending || disposed) return undefined;
      pending = true;
      onPending(true);
      try {
        const envelope: ActionEnvelope = {
          actionId: crypto.randomUUID(),
          expectedRevision: state.revision,
          expectedTurn: state.turnSeq,
          command,
        };
        let result: ActionResult;
        try {
          result = await socket.timeout(8000).emitWithAck("game:action", envelope);
        } catch {
          if (disposed) return undefined;
          await reconnect();
          if (disposed) return undefined;
          result = await socket.timeout(8000).emitWithAck("game:action", envelope);
        }
        if (!disposed)
          onNotice(
            result.accepted
              ? null
              : result.error?.code === "STALE_STATE"
                ? { tone: "info", message: "The table changed — try again." }
                : { tone: "error", message: result.error?.message ?? "That move was rejected." },
          );
        return result;
      } catch {
        if (!disposed)
          onNotice({
            tone: "info",
            message: "Connection lost — your move may not have been sent.",
          });
        return undefined;
      } finally {
        pending = false;
        if (!disposed) onPending(false);
      }
    },
    dispose() {
      disposed = true;
      cancelReconnect?.();
    },
  };
}

export function shouldAcceptSnapshot(
  current: PublicGameState | null,
  incoming: PublicGameState,
): boolean {
  return (
    !current || current.roomCode !== incoming.roomCode || incoming.revision >= current.revision
  );
}
