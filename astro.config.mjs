// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
	site: "https://bnm.st",
	adapter: vercel({
		// Optimise images on demand instead of shipping every size from the build.
		imageService: true,
	}),
	vite: {
		plugins: [tailwindcss()],
	},
	fonts: [
		{
			provider: fontProviders.local(),
		imagesConfig: {
			// Every width a component asks for has to be listed here, or Vercel drops it from the srcset.
			sizes: [320, 480, 640, 800, 960, 1080, 1200, 1400, 1600, 1680, 1966, 2200, 2800, 3456],
			domains: [],
		},
			name: "Neue Montreal",
			cssVariable: "--font-neue-montreal",
			options: {
				// Only ship variants the site actually uses — every variant
				// listed here gets preloaded on every page.
				variants: [
					{
						src: [
							"./src/assets/fonts/neue-montreal/PPNeueMontreal-Regular.woff2",
						],
						weight: "500",
						style: "normal",
					},
					{
						src: [
							"./src/assets/fonts/neue-montreal/PPNeueMontreal-Semibold.woff2",
						],
						weight: "700",
						style: "normal",
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "Neue Montreal Mono",
			cssVariable: "--font-neue-montreal-mono",
			options: {
				variants: [
					{
						src: [
							"./src/assets/fonts/neue-montreal-mono/PPNeueMontrealMono-Medium.woff2",
						],
						weight: "500",
						style: "normal",
					},
				],
			},
		},
	],
});
