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
const DISPLACEMENT = 0.055;

/** Sampling inset, so the displacement never reaches past the image edge. */
const INSET = 0.94;

/** How long the flash takes to sweep from the far plane to the near one, in ms. */
const FLASH_DURATION = 900;

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
    uniform float uFlash;

    float luma(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
    }

    /* Without a depth map, a blurred copy stands in for one: bright reads as near. */
    float depthAt(vec2 uv) {
        float depth = uHasDepth
            ? texture2D(uDepth, uv).r
            : luma(texture2D(uTexture, uv, 7.0).rgb);

        return uInvert ? 1.0 - depth : depth;
    }

    void main() {
        vec2 uv = (vUv - 0.5) * uCover + 0.5;

        float depth = depthAt(uv);

        /* Pixels tear where the depth steps, so the step itself holds the displacement back.
           Flat areas get the full travel, edges get almost none. */
        vec2 step = vec2(0.012, 0.012);
        float dx = depthAt(uv + vec2(step.x, 0.0)) - depthAt(uv - vec2(step.x, 0.0));
        float dy = depthAt(uv + vec2(0.0, step.y)) - depthAt(uv - vec2(0.0, step.y));
        float edge = smoothstep(0.04, 0.22, length(vec2(dx, dy)));

        vec2 shifted = uv + uPointer * ${DISPLACEMENT.toFixed(3)} * (depth - 0.5) * (1.0 - 0.9 * edge);

        /* A plane of light sweeps from the far plane to the near one, lighting each depth in turn. */
        float sweep = abs(depth - uFlash);
        float band = 1.0 - smoothstep(0.0, 0.16, sweep);
        float envelope = sin(3.14159 * uFlash);

        /* Focus rides the same sweep: what the light has not reached yet is still soft. */
        float blur = envelope * smoothstep(0.1, 0.5, sweep);

        vec3 sharp = texture2D(uTexture, shifted).rgb;
        vec3 soft = texture2D(uTexture, shifted, 5.0).rgb;

        vec3 color = mix(sharp, soft, blur);

        color += band * envelope * 0.7 * (0.4 + 0.6 * sharp);

        gl_FragColor = vec4(color, 1.0);
    }
`;

export const mount = (el: HTMLElement) => {
    const { isTouchScreen, isReducedMotion } = $mediaStatus.get();
    if (isTouchScreen || isReducedMotion) return;

    const image = el.querySelector<HTMLImageElement>("[data-depth-image-layer]");
    if (!image) return;

    /* The canvas replaces the image in place, so whatever wrapper carries the scroll
       parallax carries the canvas too. */
    const host = image.parentElement ?? el;

    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500";
    host.prepend(canvas);

    let renderer: WebGLRenderer;
    try {
        renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    } catch (error) {
        console.error("[behavior:depth-image] no WebGL context:", error);
        canvas.remove();
        return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

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
            uFlash: { value: 1 },
        },
    });

    scene.add(new Mesh(new PlaneGeometry(2, 2), material));

    const loader = new TextureLoader();
    let aspect = 1;

    const resize = () => {
        const { width, height } = host.getBoundingClientRect();
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

        /* Compile and draw once up front. Left to the first visible frame, the program link
           lands exactly as the element scrolls in and shows up as a stutter. */
        renderer.compile(scene, camera);
        renderer.render(scene, camera);

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

    let frame: number | null = null;
    let wasInside = false;
    let flashStart = -FLASH_DURATION;
    let visible = false;

    const tick = () => {
        const rect = el.getBoundingClientRect();
        const { smoothX, smoothY } = $smoothMouse.get();

        const x = ((smoothX - rect.left) / rect.width - 0.5) * 2;
        const y = ((smoothY - rect.top) / rect.height - 0.5) * 2;

        /* Hover comes from the pointer the loop already tracks, so no overlay can swallow it. */
        const inside = Math.abs(x) <= 1 && Math.abs(y) <= 1;

        if (inside && !wasInside) flashStart = performance.now();
        wasInside = inside;

        const elapsed = (performance.now() - flashStart) / FLASH_DURATION;
        material.uniforms.uFlash.value = clamp(0, 1, elapsed);

        /* Off the image the pointer eases back to centre, so nothing distorts from
           a cursor that is somewhere else on the page. */
        const targetX = inside ? clamp(-1, 1, x) : 0;
        const targetY = inside ? clamp(-1, 1, y) : 0;

        const pointer = material.uniforms.uPointer.value as Vector2;
        const nextX = pointer.x + (targetX - pointer.x) * 0.15;
        const nextY = pointer.y + (targetY - pointer.y) * 0.15;

        const moved = Math.abs(nextX - pointer.x) > 0.0005 || Math.abs(nextY - pointer.y) > 0.0005;

        /* Nothing here reacts to scroll, so a still pointer and a finished flash need no frame. */
        if (elapsed < 1 || moved) {
            pointer.set(nextX, nextY);
            renderer.render(scene, camera);
        }

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
    resizeObserver.observe(host);

    return () => {
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
