import { createSigilScene } from "@/scripts/utils/sigil";
import { clamp, mapRange } from "@/scripts/utils/maths";
import { $screenDebounce } from "@/stores/screen";
import { $smoothMouse } from "@/stores/mouse";
import { $scroll } from "@/stores/scroll";

/** Full turns around its own axis across the scroll range. */
const TURNS = 0.75;
/** Edge-on at the start, open halo at the end. */
const OPEN = Math.PI / 2;
/** How far the cursor pushes the sigil, in radians and world units. */
const MOUSE_TURN = 0.5;
const MOUSE_SHIFT = 0.25;

const easeInOut = (value: number) => value * value * (3 - 2 * value);

export const mount = (canvas: HTMLElement) => {
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const sigil = createSigilScene(canvas, () => render());
    const { group } = sigil;

    let start = 0;
    let distance = 1;
    let progress = 0;

    const measure = () => {
        const rect = canvas.getBoundingClientRect();
        start = rect.top + window.scrollY - window.innerHeight;
        distance = Math.max(1, rect.height + window.innerHeight);
        sigil.resize();
    };

    const render = () => {
        if (!sigil.isLoaded() || progress <= 0 || progress >= 1) return;

        const opened = easeInOut(progress);
        const { smoothNormalizedX, smoothNormalizedY } = $smoothMouse.get();
        const mouseX = smoothNormalizedX - 0.5;
        const mouseY = smoothNormalizedY - 0.5;

        group.rotation.x = -opened * OPEN + mouseY * MOUSE_TURN;
        group.rotation.y = progress * Math.PI * 2 * TURNS + mouseX * MOUSE_TURN;
        group.position.x = mouseX * MOUSE_SHIFT;
        group.position.y = mapRange(0, 1, 0.4, -0.4, progress) - mouseY * MOUSE_SHIFT;
        group.scale.setScalar(mapRange(0, 1, 1.35, 0.9, opened));

        sigil.camera.position.z = mapRange(0, 1, 3.4, 4.6, opened);

        sigil.render();
    };

    const onScroll = ({ scroll }: { scroll: number }) => {
        progress = clamp(0, 1, (scroll - start) / distance);
        render();
    };

    measure();

    const unsubscribeScreen = $screenDebounce.subscribe(() => {
        measure();
        render();
    });
    const unsubscribeScroll = $scroll.subscribe(onScroll);
    const unsubscribeMouse = $smoothMouse.subscribe(render);

    return () => {
        unsubscribeScreen();
        unsubscribeScroll();
        unsubscribeMouse();
        sigil.dispose();
    };
};
