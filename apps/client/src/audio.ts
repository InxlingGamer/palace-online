import { useCallback, useMemo, useRef, useState } from "react";

export type SoundName =
  | "shuffle"
  | "deal"
  | "draw"
  | "receive"
  | "place"
  | "collect"
  | "play"
  | "pickup"
  | "burn"
  | "reveal"
  | "join"
  | "ready"
  | "reject"
  | "win"
  | "lose";

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
    (name: SoundName, delayMs = 0) => {
      if (muted) return;
      unlock();
      const audio = context.current;
      if (!audio) return;
      const start = audio.currentTime + delayMs / 1000;

      const tone = (
        frequency: number,
        duration: number,
        volume: number,
        type: OscillatorType = "sine",
        endFrequency = frequency,
        offset = 0,
      ) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const at = start + offset;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(20, endFrequency),
          at + duration,
        );
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.012, duration / 3));
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.02);
      };

      const noise = (
        duration: number,
        volume: number,
        frequency: number,
        offset = 0,
        filterType: BiquadFilterType = "bandpass",
      ) => {
        const frameCount = Math.max(1, Math.floor(audio.sampleRate * duration));
        const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < frameCount; index += 1)
          data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
        const source = audio.createBufferSource();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        const at = start + offset;
        source.buffer = buffer;
        filter.type = filterType;
        filter.frequency.setValueAtTime(frequency, at);
        filter.Q.setValueAtTime(0.8, at);
        gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        source.connect(filter).connect(gain).connect(audio.destination);
        source.start(at);
      };

      const horn = (frequency: number, endFrequency: number, duration: number, offset = 0) => {
        const oscillator = audio.createOscillator();
        const overtone = audio.createOscillator();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        const overtoneGain = audio.createGain();
        const at = start + offset;
        oscillator.type = "sawtooth";
        overtone.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, at);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
        overtone.frequency.setValueAtTime(frequency * 1.99, at);
        overtone.frequency.exponentialRampToValueAtTime(endFrequency * 1.96, at + duration);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(760, at);
        filter.frequency.exponentialRampToValueAtTime(330, at + duration);
        filter.Q.setValueAtTime(4.5, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.065, at + 0.08);
        gain.gain.setValueAtTime(0.052, at + Math.max(0.09, duration - 0.16));
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        overtoneGain.gain.setValueAtTime(0.018, at);
        oscillator.connect(filter);
        overtone.connect(overtoneGain).connect(filter);
        filter.connect(gain).connect(audio.destination);
        oscillator.start(at);
        overtone.start(at);
        oscillator.stop(at + duration + 0.03);
        overtone.stop(at + duration + 0.03);
      };

      switch (name) {
        case "shuffle":
          for (let index = 0; index < 5; index += 1) noise(0.09, 0.08, 1700, index * 0.055);
          tone(130, 0.34, 0.035, "triangle", 190);
          break;
        case "deal":
        case "receive":
          noise(0.075, 0.11, 2400);
          tone(name === "deal" ? 260 : 310, 0.09, 0.045, "triangle", 190);
          break;
        case "draw":
          noise(0.18, 0.095, 1800);
          tone(210, 0.2, 0.055, "triangle", 430, 0.035);
          break;
        case "place":
        case "play":
          noise(0.055, 0.14, 950);
          tone(name === "place" ? 175 : 140, 0.11, 0.065, "square", 90);
          break;
        case "collect":
        case "pickup":
          noise(0.24, 0.11, 900);
          tone(115, 0.24, 0.06, "sawtooth", 260);
          break;
        case "burn":
          noise(0.52, 0.16, 430, 0, "lowpass");
          tone(95, 0.45, 0.08, "sawtooth", 42);
          tone(460, 0.18, 0.035, "square", 120, 0.08);
          break;
        case "reveal":
          noise(0.1, 0.08, 3100);
          tone(280, 0.25, 0.055, "triangle", 620, 0.035);
          break;
        case "join":
        case "ready":
          tone(330, 0.11, 0.045, "triangle", 440);
          tone(494, 0.16, 0.04, "triangle", 660, 0.1);
          break;
        case "reject":
          tone(185, 0.1, 0.055, "square", 130);
          tone(145, 0.13, 0.045, "square", 105, 0.09);
          break;
        case "win":
          [440, 554, 659, 880].forEach((frequency, index) =>
            tone(frequency, 0.34, 0.055, "triangle", frequency * 1.04, index * 0.11),
          );
          break;
        case "lose":
          horn(294, 196, 0.62);
          horn(247, 147, 0.72, 0.48);
          horn(196, 82, 1.05, 1.02);
          noise(0.14, 0.09, 620, 1.62, "lowpass");
          noise(0.22, 0.07, 360, 1.93, "lowpass");
          break;
      }
    },
    [muted, unlock],
  );

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    localStorage.setItem("palace-muted", String(value));
  }, []);

  return useMemo(() => ({ muted, setMuted, unlock, play }), [muted, play, setMuted, unlock]);
}
