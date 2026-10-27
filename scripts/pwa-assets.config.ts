import {
	defineConfig,
	minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

const teal = "#0F5C5C";

/**
 * Generates favicon + PWA icons from public/favicon.svg (Ta'seel ت mark).
 * Brand master: assets/brand/taseel-icon-512.png → rebuild favicon.svg then:
 *   pnpm generate:pwa-assets
 *
 * Preset: minimal-2023 (How to Favicon 2023 + Vite PWA guidance).
 */
export default defineConfig({
	headLinkOptions: {
		preset: "2023",
	},
	preset: {
		...minimal2023Preset,
		transparent: {
			sizes: [64, 192, 512],
			favicons: [[48, "favicon.ico"]],
			// Source already has letter padding; keep edges tight.
			padding: 0,
		},
		maskable: {
			sizes: [512],
			padding: 0.1,
			resizeOptions: {
				fit: "contain",
				background: teal,
			},
		},
		apple: {
			sizes: [180],
			padding: 0.1,
			resizeOptions: {
				fit: "contain",
				background: teal,
			},
		},
		png: {
			compressionLevel: 9,
			quality: 90,
		},
	},
	images: ["public/favicon.svg"],
});
