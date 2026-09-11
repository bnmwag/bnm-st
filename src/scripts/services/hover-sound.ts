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

/** Hover: a short tick, quiet enough to sit under the page. */
const HOVER: Flap[] = [
    { delay: 0, gain: 0.2, decay: 0.04, frequency: 2600 },
    { delay: 0.02, gain: 0.12, decay: 0.19, frequency: 1500 },
];

/** Press: the same shutter, fuller and a touch longer. */
const PRESS: Flap[] = [
    { delay: 0, gain: 0.32, decay: 0.06, frequency: 1900 },
    { delay: 0.06, gain: 0.2, decay: 0.28, frequency: 950 },
];

/** Shortest gap between two sounds, so crossing a row of links stays clean. */
const MIN_GAP = 90;

export const createShutter = (context: AudioContext) => {
    const length = Math.floor(context.sampleRate * 0.3);
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
        let lastAt = 0;

        /* Browsers only allow audio once the visitor has interacted with the page. */
        const prepare = () => {
            if (context) return;

            context = new AudioContext();
            play = createShutter(context);
        };

        const sound = (flaps: Flap[]) => {
            const now = performance.now();
            if (now - lastAt < MIN_GAP) return;

            lastAt = now;

            if (context?.state === "suspended") void context.resume();
            play?.(flaps);
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
