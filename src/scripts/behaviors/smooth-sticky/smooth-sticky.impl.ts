import { $screenDebounce } from "@/stores/screen";
import { $scroll } from "@/stores/scroll";

/** Accepts px, vh or svh, so the offset can follow the viewport. */
const parseOffset = (value: string | undefined): number => {
    if (!value) return 0;

    const amount = Number.parseFloat(value);
    if (Number.isNaN(amount)) return 0;

    return /(s?vh)$/.test(value.trim()) ? (amount / 100) * window.innerHeight : amount;
};

/**
 * Rounds the corner of a clamp. Below zero it holds, above the window it tracks one to one, and
 * in between it follows the integral of a smoothstep, so speed leaves and reaches one to one with
 * no jump in acceleration either.
 */
const softenStart = (value: number, window: number): number => {
    if (value <= 0) return 0;
    if (value >= window) return value - window / 2;

    const progress = value / window;
    return window * progress ** 3 * (1 - progress / 2);
};

/**
 * Sticky that eases into and out of the pinned state. The element keeps its place in flow and
 * rides on a transform. Between the two corners it tracks scroll exactly, like a normal sticky.
 * Range comes from the nearest [data-smooth-sticky-bounds], or the parent.
 */
export const mount = (el: HTMLElement) => {
    const bounds = el.closest<HTMLElement>("[data-smooth-sticky-bounds]") ?? el.parentElement;
    if (!bounds) return;

    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /** Scroll distance spent easing in and out. */
    const soften = isReduced ? 0 : Number(el.dataset.smoothStickyEase ?? 320);

    let start = 0;
    let travel = 0;

    const measure = () => {
        el.style.transform = "";

        const rect = el.getBoundingClientRect();
        const boundsRect = bounds.getBoundingClientRect();
        const top = rect.top + window.scrollY;

        start = top - parseOffset(el.dataset.smoothStickyTop);
        travel = Math.max(0, boundsRect.bottom + window.scrollY - top - rect.height);
    };

    const render = ({ scroll }: { scroll: number }) => {
        const raw = scroll - start;

        if (soften === 0) {
            el.style.transform = `translate3d(0, ${Math.min(Math.max(raw, 0), travel)}px, 0)`;
            return;
        }

        const half = soften / 2;
        const eased = softenStart(raw + half, soften);
        const remaining = softenStart(travel - eased + half, soften);

        el.style.transform = `translate3d(0, ${travel - remaining}px, 0)`;
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
        el.style.transform = "";
    };
};
