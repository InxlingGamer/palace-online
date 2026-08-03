import { useCallback, useRef, useState } from "react";

export type SoundName =
  "shuffle" | "deal" | "draw" | "play" | "pickup" | "burn" | "reveal" | "win" | "lose";

const soundShape: Record<SoundName, [number, number, number]> = {
  shuffle: [180, 260, 0.1],
  deal: [260, 180, 0.07],
  draw: [220, 320, 0.06],
  play: [150, 110, 0.08],
  pickup: [120, 240, 0.14],
  burn: [90, 45, 0.22],
  reveal: [300, 540, 0.12],
  win: [440, 880, 0.3],
  lose: [240, 120, 0.28],
};

export function useSound() {
  const [muted, setMutedState] = useState(() => localStorage.getItem("palace-muted") === "true");
  const context = useRef<AudioContext | null>(null);

  const unlock = useCallback(() => {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    context.current ??= new AudioContextConstructor();
    if (context.current.state === "suspended") void context.current.resume();
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (muted) return;
      unlock();
      const audio = context.current;
      if (!audio) return;
      const [start, end, duration] = soundShape[name];
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = name === "burn" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(start, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(end, audio.currentTime + duration);
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    },
    [muted, unlock],
  );

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    localStorage.setItem("palace-muted", String(value));
  }, []);

  return { muted, setMuted, unlock, play };
}
