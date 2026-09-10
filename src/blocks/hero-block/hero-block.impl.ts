import {
    ACESFilmicToneMapping,
    Box3,
    Group,
    Mesh,
    PerspectiveCamera,
    PMREMGenerator,
    Scene,
    Vector3,
    WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { clamp, mapRange } from "@/scripts/utils/maths";
import { $screenDebounce } from "@/stores/screen";
import { $scroll } from "@/stores/scroll";

import modelUrl from "@/assets/models/chrome_sigil_halo.glb?url";

const TURNS = 1.25;
const TILT = 0.45;
const DRIFT = 0.35;

export const mount = (canvas: HTMLElement) => {
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    const pmrem = new PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;

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

        sigil.rotation.y = progress * Math.PI * 2 * TURNS;
        sigil.rotation.x = mapRange(0, 1, -TILT, TILT, progress);
        sigil.position.y = mapRange(0, 1, -DRIFT, DRIFT, progress);
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

    return () => {
        unsubscribeScreen();
        unsubscribeScroll();
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
