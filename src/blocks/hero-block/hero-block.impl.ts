import {
    ACESFilmicToneMapping,
    Box3,
    Color,
    Group,
    Mesh,
    PerspectiveCamera,
    PMREMGenerator,
    PointLight,
    Scene,
    Vector3,
    WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { clamp, mapRange } from "@/scripts/utils/maths";
import { $screenDebounce } from "@/stores/screen";
import { $smoothMouse } from "@/stores/mouse";
import { $scroll } from "@/stores/scroll";

import modelUrl from "@/assets/models/chrome_sigil_halo.glb?url";

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

    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    const pmrem = new PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;

    const rim = new PointLight(new Color("#EA2121"), 0, 12);
    rim.position.set(-2.5, 1.5, 1.5);
    scene.add(rim);

    const sigil = new Group();
    scene.add(sigil);

    let start = 0;
    let distance = 1;
    let progress = 0;
    let isLoaded = false;

    const measure = () => {
        const rect = canvas.getBoundingClientRect();
        start = rect.top + window.scrollY - window.innerHeight;
        distance = Math.max(1, rect.height + window.innerHeight);

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };

    const render = () => {
        if (!isLoaded || progress <= 0 || progress >= 1) return;

        const opened = easeInOut(progress);
        const { smoothNormalizedX, smoothNormalizedY } = $smoothMouse.get();
        const mouseX = smoothNormalizedX - 0.5;
        const mouseY = smoothNormalizedY - 0.5;

        sigil.rotation.x = -opened * OPEN + mouseY * MOUSE_TURN;
        sigil.rotation.y = progress * Math.PI * 2 * TURNS + mouseX * MOUSE_TURN;
        sigil.position.x = mouseX * MOUSE_SHIFT;
        sigil.position.y = mapRange(0, 1, 0.4, -0.4, progress) - mouseY * MOUSE_SHIFT;
        sigil.scale.setScalar(mapRange(0, 1, 1.35, 0.9, opened));

        camera.position.z = mapRange(0, 1, 3.4, 4.6, opened);
        rim.intensity = opened * 18;

        renderer.render(scene, camera);
    };

    const onScroll = ({ scroll }: { scroll: number }) => {
        progress = clamp(0, 1, (scroll - start) / distance);
        render();
    };

    measure();

    new GLTFLoader().load(
        modelUrl,
        (gltf) => {
            const box = new Box3().setFromObject(gltf.scene);
            const size = box.getSize(new Vector3());
            const center = box.getCenter(new Vector3());

            gltf.scene.position.sub(center);
            gltf.scene.scale.setScalar(2 / Math.max(size.x, size.y, size.z));

            sigil.add(gltf.scene);
            isLoaded = true;
            render();
        },
        undefined,
        (error) => console.error("[hero-sigil] failed to load model:", error),
    );

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
        sigil.traverse((child) => {
            if (!(child instanceof Mesh)) return;
            child.geometry.dispose();
            for (const material of [child.material].flat()) material.dispose();
        });
        environment.texture.dispose();
        pmrem.dispose();
        renderer.dispose();
    };
};
