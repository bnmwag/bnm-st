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

import modelUrl from "@/assets/models/chrome_sigil_halo.glb?url";

export interface ISigilScene {
    /** The loaded model, ready to be rotated, scaled and moved. */
    group: Group;
    camera: PerspectiveCamera;
    isLoaded: () => boolean;
    resize: () => void;
    render: () => void;
    dispose: () => void;
}

/**
 * Sets up the chrome sigil on a canvas: renderer, room environment and the model,
 * centred and scaled to fit two units.
 */
export const createSigilScene = (
    canvas: HTMLCanvasElement,
    onLoad?: () => void,
): ISigilScene => {
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

    const group = new Group();
    scene.add(group);

    let loaded = false;

    new GLTFLoader().load(
        modelUrl,
        (gltf) => {
            const box = new Box3().setFromObject(gltf.scene);
            const size = box.getSize(new Vector3());
            const center = box.getCenter(new Vector3());

            gltf.scene.position.sub(center);
            gltf.scene.scale.setScalar(2 / Math.max(size.x, size.y, size.z));

            group.add(gltf.scene);
            loaded = true;
            onLoad?.();
        },
        undefined,
        (error) => console.error("[sigil] failed to load model:", error),
    );

    return {
        group,
        camera,
        isLoaded: () => loaded,
        resize: () => {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        },
        render: () => renderer.render(scene, camera),
        dispose: () => {
            group.traverse((child) => {
                if (!(child instanceof Mesh)) return;
                child.geometry.dispose();
                for (const material of [child.material].flat()) material.dispose();
            });
            environment.texture.dispose();
            pmrem.dispose();
            renderer.dispose();
        },
    };
};
