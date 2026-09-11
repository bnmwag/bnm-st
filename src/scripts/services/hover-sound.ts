import { defineService } from "@/scripts/core";
import { $mediaStatus } from "@/stores/device-status";

const SELECTOR = ".button-swap, .text-swap, [data-hover-sound]";

/** A button carries a .text-swap inside it, so the button itself wins. */
const resolve = (node: EventTarget | null) => {
    const el = node as HTMLElement | null;
    return el?.closest(".button-swap") ?? el?.closest(SELECTOR) ?? null;
};

type Flap = {
    delay: number;
    gain: number;
    decay: number;
    frequency: number;
};

/** Two clicks, one for the blade opening and one for it closing. */
const ENTER: Flap[] = [
    { delay: 0, gain: 0.16, decay: 0.035, frequency: 2600 },
    { delay: 0.055, gain: 0.1, decay: 0.05, frequency: 1700 },
];

/** The same pair run backwards and softer, so leaving answers entering. */
const LEAVE: Flap[] = [
    { delay: 0, gain: 0.09, decay: 0.045, frequency: 1700 },
    { delay: 0.045, gain: 0.12, decay: 0.03, frequency: 2600 },
];

/** Grace after leaving, so moving straight to the next link reads as one move. */
const GRACE = 110;

/** Shortest gap between two sounds, so they never pile up. */
const MIN_GAP = 140;

export const createShutter = (context: AudioContext) => {
    const length = Math.floor(context.sampleRate * 0.2);
    const noise = context.createBuffer(1, length, context.sampleRate);
    const channel = noise.getChannelData(0);

    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;

    return (flaps: Flap[]) => {
        const now = context.currentTime;

        for (const flap of flaps) {
            const source = context.createBufferSource();
            source.buffer = noise;

            const band = context.createBiquadFilter();
            band.type = "bandpass";
            band.frequency.value = flap.frequency;
            band.Q.value = 1.4;

            const gain = context.createGain();
            const start = now + flap.delay;

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(flap.gain, start + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + flap.decay);

            source.connect(band).connect(gain).connect(context.destination);
            source.start(start);
            source.stop(start + flap.decay + 0.02);
        }
    };
};

defineService({
    name: "hover-sound",
    scope: "app",
    setup() {
        if ($mediaStatus.get().isTouchScreen) return;

        let context: AudioContext | undefined;
        let play: ((flaps: Flap[]) => void) | undefined;

        let current: Element | null = null;
        let sounded = false;
        let lastSoundAt = 0;
        let leaveTimer: number | undefined;

        /* Browsers only allow audio once the visitor has interacted with the page. */
        const prepare = () => {
            if (context) return;

            context = new AudioContext();
            play = createShutter(context);
        };

        const sound = (flaps: Flap[]) => {
            const now = performance.now();
            if (now - lastSoundAt < MIN_GAP) return false;

            lastSoundAt = now;

            if (context?.state === "suspended") void context.resume();
            play?.(flaps);

            return true;
        };

        const onOver = (event: PointerEvent) => {
            const target = resolve(event.target);
            if (!target || target === current) return;

            /* Landing on the next link cancels the last one's exit: one move, one sound. */
            window.clearTimeout(leaveTimer);

            current = target;
            sounded = sound(ENTER);
        };

        const onOut = (event: PointerEvent) => {
            const target = resolve(event.target);
            if (!target || target !== current) return;

            /* Moving between children of the same button is not leaving it. */
            const next = event.relatedTarget as Node | null;
            if (next && target.contains(next)) return;

            current = null;

            /* Only answer an entrance that was actually heard, and only for inline links. */
            if (!sounded || target.classList.contains("button-swap")) return;

            sounded = false;
            leaveTimer = window.setTimeout(() => sound(LEAVE), GRACE);
        };

        window.addEventListener("pointerdown", prepare, { once: true });
        window.addEventListener("keydown", prepare, { once: true });
        window.addEventListener("pointerover", onOver);
        window.addEventListener("pointerout", onOut);

        return () => {
            window.clearTimeout(leaveTimer);
            window.removeEventListener("pointerdown", prepare);
            window.removeEventListener("keydown", prepare);
            window.removeEventListener("pointerover", onOver);
            window.removeEventListener("pointerout", onOut);
            void context?.close();
        };
    },
});
