import { clamp } from "@/scripts/utils/maths";
import { $scroll } from "@/stores/scroll";
import { $screenDebounce } from "@/stores/screen";

const PARALLAX_RATIO = 0.12;

export const mount = (el: HTMLElement) => {
    const title = el.querySelector<HTMLElement>("[data-work-title]");
    if (!title) return;

    let start = 0;
    let distance = 1;

    const measure = () => {
        const rect = el.getBoundingClientRect();
        start = rect.top + window.scrollY;
        distance = Math.max(1, rect.height);
    };

    const render = ({ scroll }: { scroll: number }) => {
        const progress = clamp(0, 1, (scroll - start) / distance);
        const offset = (progress - 0.5) * -PARALLAX_RATIO * window.innerHeight;
        title.style.transform = `translate3d(0, ${offset}px, 0)`;
    };

    measure();

    const unsubscribeScreen = $screenDebounce.subscribe(measure);
    const unsubscribeScroll = $scroll.subscribe(render);

    return () => {
        unsubscribeScreen();
        unsubscribeScroll();
        title.style.transform = "";
    };
};
