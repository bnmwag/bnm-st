import { $screenDebounce } from "@/stores/screen";
import { $scroll } from "@/stores/scroll";

/** Keeps the nav sitting on the hero's headline until scrolling docks it at the top. */
export const mount = (el: HTMLElement) => {
    const heading = document.querySelector<HTMLElement>("[data-hero-block] .text-display");

    let offset = 0;

    const measure = () => {
        /* Below lg the headline is small enough that the nav would sit on top of it. */
        if (!heading || window.innerWidth < 1024) {
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

    measure();

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
