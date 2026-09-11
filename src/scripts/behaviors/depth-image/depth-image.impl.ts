import {
    LinearMipmapLinearFilter,
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    TextureLoader,
    Vector2,
    WebGLRenderer,
    type Texture,
} from "three";

import { clamp } from "@/scripts/utils/maths";
import { $mediaStatus } from "@/stores/device-status";
import { $smoothMouse } from "@/stores/mouse";

/** How far the near plane slides against the far plane, in UV units. */
const DISPLACEMENT = 0.035;

/** Sampling inset, so the displacement never reaches past the image edge. */
const INSET = 0.94;

const vertexShader = /* glsl */ `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    precision highp float;

    varying vec2 vUv;

    uniform sampler2D uTexture;
    uniform sampler2D uDepth;
    uniform bool uHasDepth;
    uniform bool uInvert;
    uniform vec2 uCover;
    uniform vec2 uPointer;
    uniform float uFocus;

    float luma(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
    }

    /* Without a depth map, a heavily blurred copy stands in for one: bright reads as near. */
    float depthAt(vec2 uv) {
        float depth = uHasDepth
            ? texture2D(uDepth, uv).r
            : luma(texture2D(uTexture, uv, 6.0).rgb);

        return uInvert ? 1.0 - depth : depth;
    }

    void main() {
        vec2 uv = (vUv - 0.5) * uCover + 0.5;

        float depth = depthAt(uv);

        vec2 shifted = uv + uPointer * ${DISPLACEMENT.toFixed(3)} * (depth - 0.5);

        /* Focus sits on whatever the pointer is over, so the rest falls away from it. */
        vec2 pointerUv = (uPointer * 0.5) * uCover + 0.5;
        float distance = abs(depth - depthAt(pointerUv));

        float blur = uFocus * smoothstep(0.06, 0.45, distance);

        vec3 sharp = texture2D(uTexture, shifted).rgb;
        vec3 soft = texture2D(uTexture, shifted, 3.0).rgb;

        gl_FragColor = vec4(mix(sharp, soft, blur), 1.0);
    }
`;

export const mount = (el: HTMLElement) => {
    const { isTouchScreen, isReducedMotion } = $mediaStatus.get();
    if (isTouchScreen || isReducedMotion) return;

    const image = el.querySelector<HTMLImageElement>("[data-depth-image-layer]");
    if (!image) return;

    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500";
    el.prepend(canvas);

    let renderer: WebGLRenderer;
    try {
        renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    } catch (error) {
        console.error("[behavior:depth-image] no WebGL context:", error);
        canvas.remove();
        return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uTexture: { value: null as Texture | null },
            uDepth: { value: null as Texture | null },
            uHasDepth: { value: false },
            uInvert: { value: el.dataset.depthInvert !== undefined },
            uCover: { value: new Vector2(1, 1) },
            uPointer: { value: new Vector2(0, 0) },
            uFocus: { value: 0 },
        },
    });

    scene.add(new Mesh(new PlaneGeometry(2, 2), material));

    const loader = new TextureLoader();
    let aspect = 1;

    const resize = () => {
        const { width, height } = el.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        renderer.setSize(width, height, false);

        /* Cover fit: sample a narrower or shorter window than the image, never a wider one. */
        const frame = width / height;
        const cover = material.uniforms.uCover.value as Vector2;
        if (frame > aspect) cover.set(INSET, (aspect / frame) * INSET);
        else cover.set((frame / aspect) * INSET, INSET);
    };

    loader.load(image.currentSrc || image.src, (texture) => {
        texture.minFilter = LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        aspect = texture.image.width / texture.image.height;
        material.uniforms.uTexture.value = texture;
        resize();
        canvas.classList.replace("opacity-0", "opacity-100");
        image.style.opacity = "0";
    });

    const depthSrc = el.dataset.depthSrc;
    if (depthSrc) {
        loader.load(depthSrc, (texture) => {
            material.uniforms.uDepth.value = texture;
            material.uniforms.uHasDepth.value = true;
        });
    }

    let focusTarget = 0;
    let frame: number | null = null;
    let visible = false;

    const tick = () => {
        const rect = el.getBoundingClientRect();
        const { smoothX, smoothY } = $smoothMouse.get();

        const pointer = material.uniforms.uPointer.value as Vector2;
        pointer.set(
            clamp(-1, 1, ((smoothX - rect.left) / rect.width - 0.5) * 2),
            clamp(-1, 1, ((smoothY - rect.top) / rect.height - 0.5) * 2),
        );

        const focus = material.uniforms.uFocus.value as number;
        material.uniforms.uFocus.value = focus + (focusTarget - focus) * 0.06;

        renderer.render(scene, camera);
        frame = visible ? requestAnimationFrame(tick) : null;
    };

    const observer = new IntersectionObserver(
        ([entry]) => {
            visible = entry.isIntersecting;
            if (visible && frame === null) frame = requestAnimationFrame(tick);
        },
        { rootMargin: "25%" },
    );

    observer.observe(el);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(el);

    const onEnter = () => {
        focusTarget = 1;
    };
    const onLeave = () => {
        focusTarget = 0;
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);

    return () => {
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointerleave", onLeave);
        observer.disconnect();
        resizeObserver.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
        (material.uniforms.uTexture.value as Texture | null)?.dispose();
        (material.uniforms.uDepth.value as Texture | null)?.dispose();
        material.dispose();
        renderer.dispose();
        canvas.remove();
        image.style.opacity = "";
    };
};
