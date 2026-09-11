import { clamp } from "@/scripts/utils/maths";
import { $screenDebounce } from "@/stores/screen";
import { $scroll } from "@/stores/scroll";

/** Dots in the field. */
const COUNT = 900;
/** The empty gap between the two clouds at rest, as a fraction of the canvas width. */
const GAP = 0.22;
/** How far each cloud spreads sideways and vertically, as fractions of width and height. */
const SPREAD = { x: 0.3, y: 0.38 };
/** Bow of a dot's path on the way in, as a fraction of height. */
const ARC = 0.18;
/** Ring radius as a fraction of the canvas height, and how much it turns per viewport scrolled. */
const RADIUS = 0.42;
const SPIN = Math.PI * 0.6;
/** The drift starts the moment the highest dot crosses the bottom edge and settles once the field's top is this far up the viewport. */
const SETTLE_AT = 0.12;

const easeInOut = (value: number) => value * value * (3 - 2 * value);

/** Roughly normal noise in -1..1, so the clouds are dense in the middle and thin at the edges. */
const gaussian = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

type Dot = {
    side: 1 | -1;
    fromX: number;
    fromY: number;
    /** Place on the ring, in radians, plus a little radial jitter so it reads as grain. */
    angle: number;
    wobble: number;
    arc: number;
    delay: number;
    radius: number;
    alpha: number;
};

/**
 * Closes the gap: grain scattered either side of an empty middle drifts in on curved paths
 * and settles into one ring, which keeps turning as the page scrolls on.
 */
export const mount = (el: HTMLElement) => {
    if (!(el instanceof HTMLCanvasElement)) return;
    const context = el.getContext("2d");
    if (!context) return;

    const dots: Dot[] = Array.from({ length: COUNT }, (_, i) => {
        const side: 1 | -1 = i % 2 === 0 ? -1 : 1;
        return {
            side,
            fromX: side * (GAP / 2 + Math.abs(gaussian()) * SPREAD.x),
            fromY: gaussian() * SPREAD.y,
            // Dots from the left settle on the left half of the ring, and so on, so paths do not cross.
            angle: Math.PI / 2 + side * ((i / COUNT) * Math.PI) + (Math.random() - 0.5) * 0.02,
            wobble: (Math.random() - 0.5) * 0.02,
            arc: gaussian() * ARC,
            delay: Math.random() * 0.4,
            radius: 0.6 + Math.random() * 0.9,
            alpha: 0.5 + Math.random() * 0.5,
        };
    });

    let top = 0;
    let width = 0;
    let height = 0;
    let scale = 1;

    const measure = () => {
        const rect = el.getBoundingClientRect();
        top = rect.top + window.scrollY;
        width = rect.width;
        height = rect.height;
        scale = Math.min(window.devicePixelRatio, 2);
        el.width = Math.round(width * scale);
        el.height = Math.round(height * scale);
        context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const draw = (progress: number, spin: number) => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = getComputedStyle(el).color;

        const cx = width / 2;
        const cy = height / 2;
        const radius = height * RADIUS;

        for (const dot of dots) {
            const t = easeInOut(clamp(0, 1, (progress - dot.delay) / (1 - dot.delay)));
            const angle = dot.angle + spin;
            const toX = Math.cos(angle) * radius * (1 + dot.wobble);
            const toY = Math.sin(angle) * radius * (1 + dot.wobble);
            const x = cx + dot.fromX * width * (1 - t) + toX * t;
            const y = cy + dot.fromY * height * (1 - t) + toY * t + dot.arc * Math.sin(t * Math.PI) * height;

            context.globalAlpha = dot.alpha;
            context.beginPath();
            context.arc(x, y, dot.radius, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;
    };

    const render = ({ scroll }: { scroll: number }) => {
        const viewport = window.innerHeight;
        // The clouds sit centred with a vertical spread, so the first dot is below the canvas top.
        const start = top + height * (0.5 - SPREAD.y) - viewport;
        const end = top - viewport * SETTLE_AT;
        if (scroll < start - viewport || scroll > top + height) return;
        // The ring turns with the page from the moment the grain starts moving, and keeps going.
        const spin = (Math.max(0, scroll - start) / viewport) * SPIN;
        draw(clamp(0, 1, (scroll - start) / (end - start)), spin);
    };

    measure();
    render($scroll.get());

    const unsubscribeScreen = $screenDebounce.subscribe(() => {
        measure();
        render($scroll.get());
    });
    const unsubscribeScroll = $scroll.subscribe(render);

    return () => {
        unsubscribeScreen();
        unsubscribeScroll();
    };
};
