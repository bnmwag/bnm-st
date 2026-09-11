import { defineService } from "@/scripts/core";
import { $mediaStatus } from "@/stores/device-status";

const SELECTOR = ".button-swap, .text-swap, [data-hover-sound]";

/** A button carries a .text-swap inside it, so the button itself wins. */
const resolve = (node: EventTarget | null) => {
    const el = node as HTMLElement | null;
    return el?.closest(".button-swap") ?? el?.closest(SELECTOR) ?? null;
};

type Whoosh = {
    gain: number;
    /** Seconds the noise swells before it peaks, then how long the tail takes to die. */
    swell: number;
    release: number;
    /** Bandpass centre at the start and at the end, in Hz. Falling reads as paper. */
    from: number;
    to: number;
};

/** Hover: a handful of paper flicks. One is picked per hover, never the same twice in a row. */
const HOVER: Whoosh[] = [
    { gain: 0.07, swell: 0.12, release: 0.07, from: 3000, to: 1100 },
    { gain: 0.06, swell: 0.08, release: 0.05, from: 3600, to: 1600 },
    { gain: 0.075, swell: 0.16, release: 0.1, from: 2400, to: 800 },
    { gain: 0.065, swell: 0.1, release: 0.08, from: 1400, to: 2800 },
];

/** Press: the same flick, a little longer and darker. */
const PRESS: Whoosh[] = [
    { gain: 0.1, swell: 0.15, release: 0.09, from: 2400, to: 750 },
    { gain: 0.09, swell: 0.12, release: 0.12, from: 1800, to: 600 },
];

/** How far each play drifts from its preset on top of the pick. */
const VARY = 0.25;

const drift = (value: number) => value * (1 + (Math.random() * 2 - 1) * VARY);

let lastPick = -1;

/** Picks a preset at random, skipping the one that just played. */
const pick = (presets: Whoosh[]): Whoosh => {
    let index = Math.floor(Math.random() * presets.length);
    if (presets.length > 1 && index === lastPick) index = (index + 1) % presets.length;
    lastPick = index;
    return presets[index];
};

/** Shortest gap between two sounds, so crossing a row of links stays clean. */
const MIN_GAP = 90;

export const createShutter = (context: AudioContext) => {
    const length = Math.floor(context.sampleRate * 0.4);
    const noise = context.createBuffer(1, length, context.sampleRate);
    const channel = noise.getChannelData(0);

    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;

    return (presets: Whoosh[]) => {
        const preset = pick(presets);
        const whoosh: Whoosh = {
            gain: drift(preset.gain),
            swell: drift(preset.swell),
            release: drift(preset.release),
            from: drift(preset.from),
            to: drift(preset.to),
        };
        const start = context.currentTime;
        const peak = start + whoosh.swell;
        const end = peak + whoosh.release;

        const source = context.createBufferSource();
        source.buffer = noise;

        // The highpass keeps the thump out; the sweeping bandpass is the "paper" part.
        const floor = context.createBiquadFilter();
        floor.type = "highpass";
        floor.frequency.value = 500;

        // A gentle lowpass rounds off the hiss.
        const ceiling = context.createBiquadFilter();
        ceiling.type = "lowpass";
        ceiling.frequency.value = 5000;

        const band = context.createBiquadFilter();
        band.type = "bandpass";
        band.Q.value = 0.7;
        band.frequency.setValueAtTime(whoosh.from, start);
        band.frequency.exponentialRampToValueAtTime(whoosh.to, end);

        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(whoosh.gain * 0.25, start + whoosh.swell * 0.6);
        gain.gain.linearRampToValueAtTime(whoosh.gain, peak);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        source.connect(floor).connect(ceiling).connect(band).connect(gain).connect(context.destination);
        source.start(start);
        source.stop(end + 0.02);
    };
};

defineService({
    name: "hover-sound",
    scope: "app",
    setup() {
        if ($mediaStatus.get().isTouchScreen) return;

        let context: AudioContext | undefined;
        let play: ((presets: Whoosh[]) => void) | undefined;

        let current: Element | null = null;
        let lastAt = 0;

        /* Browsers only allow audio once the visitor has interacted with the page. */
        const prepare = () => {
            if (context) return;

            context = new AudioContext();
            play = createShutter(context);
        };

        const sound = (presets: Whoosh[]) => {
            const now = performance.now();
            if (now - lastAt < MIN_GAP) return;

            lastAt = now;

            if (context?.state === "suspended") void context.resume();
            play?.(presets);
        };

        const onOver = (event: PointerEvent) => {
            const target = resolve(event.target);
            if (!target || target === current) return;

            current = target;
            sound(HOVER);
        };

        const onOut = (event: PointerEvent) => {
            const target = resolve(event.target);
            if (!target || target !== current) return;

            /* Moving between children of the same button is not leaving it. */
            const next = event.relatedTarget as Node | null;
            if (next && target.contains(next)) return;

            current = null;
        };

        const onDown = (event: PointerEvent) => {
            prepare();
            if (resolve(event.target)) sound(PRESS);
        };

        window.addEventListener("pointerdown", onDown);
        window.addEventListener("keydown", prepare, { once: true });
        window.addEventListener("pointerover", onOver);
        window.addEventListener("pointerout", onOut);

        return () => {
            window.removeEventListener("pointerdown", onDown);
            window.removeEventListener("keydown", prepare);
            window.removeEventListener("pointerover", onOver);
            window.removeEventListener("pointerout", onOut);
            void context?.close();
        };
    },
});
