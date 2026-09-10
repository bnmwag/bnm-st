import { $screenDebounce } from "@/stores/screen";
import { $scroll } from "@/stores/scroll";

const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

/**
 * Keeps the nav sitting on the hero's headline until scrolling docks it at the top,
 * and ticks the Vienna clock.
 */
export const mount = (el: HTMLElement) => {
    const clockEl = el.querySelector<HTMLElement>("[data-site-nav-clock]");
    const heading = document.querySelector<HTMLElement>("[data-hero-block] .text-display");

    let offset = 0;

    const measure = () => {
        if (!heading) {
            offset = 0;
            return;
        }

        el.style.transform = "";
        const nav = el.getBoundingClientRect();
        const headingRect = heading.getBoundingClientRect();

        const dockedCenter = nav.top + window.scrollY + nav.height / 2;
        const restingCenter = headingRect.top + window.scrollY + headingRect.height / 2;
        offset = Math.max(0, restingCenter - dockedCenter);
    };

    const render = ({ scroll }: { scroll: number }) => {
        const shift = Math.max(0, offset - scroll);
        el.style.transform = `translate3d(0, ${shift}px, 0)`;
    };

    const tick = () => {
        if (clockEl) clockEl.textContent = clock.format(new Date());
    };

    measure();
    tick();

    const interval = window.setInterval(tick, 1000);
    const unsubscribeScreen = $screenDebounce.subscribe(() => {
        measure();
        render($scroll.get());
    });
    const unsubscribeScroll = $scroll.subscribe(render);

    return () => {
        window.clearInterval(interval);
        unsubscribeScreen();
        unsubscribeScroll();
        el.style.transform = "";
    };
};
