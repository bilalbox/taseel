import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function devFeedbackPlugin(): Plugin {
	const memoryReports: any[] = [];
	return {
		name: "dev-feedback-api",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith("/api/feedback")) {
					return next();
				}
				res.setHeader("Content-Type", "application/json");
				res.setHeader("Access-Control-Allow-Origin", "*");
				res.setHeader(
					"Access-Control-Allow-Methods",
					"GET, POST, PATCH, OPTIONS",
				);
				res.setHeader(
					"Access-Control-Allow-Headers",
					"Content-Type, Authorization, X-Admin-Key",
				);

				if (req.method === "OPTIONS") {
					res.statusCode = 204;
					return res.end();
				}

				if (req.method === "POST") {
					let body = "";
					req.on("data", (chunk) => {
						body += chunk;
					});
					req.on("end", () => {
						try {
							const data = JSON.parse(body);
							const id = `fb_dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
							const report = {
								id,
								...data,
								status: "open",
								created_at: new Date().toISOString(),
							};
							memoryReports.unshift(report);
							res.statusCode = 200;
							res.end(
								JSON.stringify({
									success: true,
									id,
									message: "تم حفظ البلاغ محلياً (بيئة التطوير)",
									stored: { memory: true },
								}),
							);
						} catch (e: any) {
							res.statusCode = 400;
							res.end(
								JSON.stringify({
									error: "خطأ في معالجة البيانات",
									details: e.message,
								}),
							);
						}
					});
					return;
				}

				if (req.method === "GET") {
					res.statusCode = 200;
					res.end(
						JSON.stringify({
							success: true,
							source: "dev_memory",
							count: memoryReports.length,
							reports: memoryReports,
						}),
					);
					return;
				}

				if (req.method === "PATCH") {
					let body = "";
					req.on("data", (chunk) => {
						body += chunk;
					});
					req.on("end", () => {
						try {
							const { id, status, resolution_notes } = JSON.parse(body);
							const rep = memoryReports.find((r) => r.id === id);
							if (rep) {
								if (status) rep.status = status;
								if (resolution_notes) rep.resolution_notes = resolution_notes;
								rep.reviewed_at = new Date().toISOString();
							}
							res.statusCode = 200;
							res.end(
								JSON.stringify({
									success: true,
									id,
									message: "تم تحديث البلاغ",
								}),
							);
						} catch (e: any) {
							res.statusCode = 400;
							res.end(JSON.stringify({ error: e.message }));
						}
					});
					return;
				}

				next();
			});
		},
	};
}

export default defineConfig({
	plugins: [
		react(),
		devFeedbackPlugin(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: "تأصيل (Ta'seel) | محرك القواعد الفقهية والأصولية لفتاوى نور على الدرب",
				short_name: "تأصيل | Ta'seel",
				description:
					"محرك بحث واختبار تفاعلي للقواعد الفقهية والأصولية والضوابط المستنبطة من أرشيف نور على الدرب للشيخين ابن باز وابن عثيمين (يعمل 100% دون اتصال عبر SQLite WASM + OPFS)",
				theme_color: "#0F5C5C",
				background_color: "#F7F6F3",
				display: "standalone",
				dir: "rtl",
				lang: "ar",
			},
			workbox: {
				// content.sqlite3.gz is persisted directly in OPFS via manifest.json
				globIgnores: ["**/content.sqlite3*", "**/*.gz"],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
		}),
	],
	optimizeDeps: {
		exclude: ["@sqlite.org/sqlite-wasm"],
	},
	worker: {
		format: "es",
	},
	server: {
		port: 3000,
		host: true,
	},
});
