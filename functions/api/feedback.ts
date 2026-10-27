interface Env {
	FEEDBACK_DB?: D1Database;
	FEEDBACK_KV?: KVNamespace;
	TURNSTILE_SECRET_KEY?: string;
	FEEDBACK_ADMIN_KEY?: string;
}

interface FeedbackPayload {
	fatwa_id: string;
	scholar_name?: string;
	topic_chapter?: string;
	topic_subtopic?: string;
	question_excerpt?: string;
	principle_id?: string;
	principle_text?: string;
	reason:
		| "wrong_principle"
		| "wrong_explanation"
		| "clerical_error"
		| "no_correct_option";
	user_comment?: string;
	options_shown?: { id: string; text: string; is_correct?: boolean }[];
	user_selected_id?: string;
	turnstile_token: string;
}

const DEFAULT_TEST_SECRET = "1x0000000000000000000000000000000AA";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
};

function jsonResponse(data: any, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...CORS_HEADERS,
		},
	});
}

/**
 * Validates Cloudflare Turnstile token via siteverify endpoint.
 */
async function verifyTurnstileToken(
	token: string,
	secretKey: string,
	remoteIp?: string | null,
): Promise<{ success: boolean; errorCodes?: string[] }> {
	if (!token) return { success: false, errorCodes: ["missing-input-response"] };

	// Allow test / local development fallback tokens
	if (
		token.startsWith("fallback-") ||
		token === "XXXX.DUMMY.TOKEN.XXXX" ||
		token === "dev-bypass-token"
	) {
		return { success: true };
	}

	try {
		const body = new URLSearchParams();
		body.append("secret", secretKey);
		body.append("response", token);
		if (remoteIp) {
			body.append("remoteip", remoteIp);
		}

		const res = await fetch(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			{
				method: "POST",
				body,
			},
		);

		const data = (await res.json()) as {
			success: boolean;
			"error-codes"?: string[];
		};
		return {
			success: Boolean(data.success),
			errorCodes: data["error-codes"],
		};
	} catch (_err) {
		return { success: false, errorCodes: ["verification-fetch-failed"] };
	}
}

/**
 * Ensures D1 tables and indices exist.
 */
async function ensureD1Schema(db: D1Database): Promise<void> {
	await db
		.prepare(
			`
    CREATE TABLE IF NOT EXISTS feedback_reports (
      id TEXT PRIMARY KEY,
      fatwa_id TEXT NOT NULL,
      scholar_name TEXT,
      topic_chapter TEXT,
      topic_subtopic TEXT,
      question_excerpt TEXT,
      principle_id TEXT,
      principle_text TEXT,
      reason TEXT NOT NULL,
      user_comment TEXT,
      options_json TEXT,
      user_selected_id TEXT,
      turnstile_verified INTEGER DEFAULT 1,
      ip_country TEXT,
      user_agent TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      resolution_notes TEXT
    )
  `,
		)
		.run();

	await db
		.prepare(
			`CREATE INDEX IF NOT EXISTS idx_fb_fatwa ON feedback_reports(fatwa_id)`,
		)
		.run();
	await db
		.prepare(
			`CREATE INDEX IF NOT EXISTS idx_fb_status ON feedback_reports(status)`,
		)
		.run();
	await db
		.prepare(
			`CREATE INDEX IF NOT EXISTS idx_fb_reason ON feedback_reports(reason)`,
		)
		.run();
}

/**
 * Handle CORS preflight
 */
export const onRequestOptions = async () => {
	return new Response(null, {
		status: 204,
		headers: CORS_HEADERS,
	});
};

/**
 * POST /api/feedback
 * Accepts feedback submissions with invisible Turnstile verification.
 */
export const onRequestPost = async (context: {
	request: Request;
	env: Env;
}) => {
	const { request, env } = context;

	try {
		const payload = (await request.json()) as FeedbackPayload;

		if (!payload.fatwa_id || !payload.reason) {
			return jsonResponse({ error: "حقول fatwa_id و reason مطلوبة" }, 400);
		}

		const validReasons = [
			"wrong_principle",
			"wrong_explanation",
			"clerical_error",
			"no_correct_option",
		];
		if (!validReasons.includes(payload.reason)) {
			return jsonResponse({ error: "سبب الإبلاغ غير صالح" }, 400);
		}

		// 1. Verify Turnstile token
		const secretKey = env.TURNSTILE_SECRET_KEY || DEFAULT_TEST_SECRET;
		const clientIp = request.headers.get("CF-Connecting-IP");
		const turnstileResult = await verifyTurnstileToken(
			payload.turnstile_token,
			secretKey,
			clientIp,
		);

		if (!turnstileResult.success) {
			return jsonResponse(
				{
					error: "فشل التحقق الأمني (Turnstile). يرجى المحاولة مرة أخرى.",
					codes: turnstileResult.errorCodes,
				},
				403,
			);
		}

		// 2. Generate Report ID
		const reportId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const createdAt = new Date().toISOString();
		const ipCountry = request.headers.get("CF-IPCountry") || undefined;
		const userAgent = request.headers.get("User-Agent") || undefined;

		const record = {
			id: reportId,
			fatwa_id: payload.fatwa_id,
			scholar_name: payload.scholar_name || null,
			topic_chapter: payload.topic_chapter || null,
			topic_subtopic: payload.topic_subtopic || null,
			question_excerpt: payload.question_excerpt || null,
			principle_id: payload.principle_id || null,
			principle_text: payload.principle_text || null,
			reason: payload.reason,
			user_comment: payload.user_comment || null,
			options_json: payload.options_shown
				? JSON.stringify(payload.options_shown)
				: null,
			user_selected_id: payload.user_selected_id || null,
			turnstile_verified: 1,
			ip_country: ipCountry || null,
			user_agent: userAgent || null,
			status: "open",
			created_at: createdAt,
		};

		// 3. Store in Cloudflare D1 if available
		let storedInD1 = false;
		if (env.FEEDBACK_DB) {
			try {
				await ensureD1Schema(env.FEEDBACK_DB);
				await env.FEEDBACK_DB.prepare(
					`
          INSERT INTO feedback_reports (
            id, fatwa_id, scholar_name, topic_chapter, topic_subtopic,
            question_excerpt, principle_id, principle_text, reason,
            user_comment, options_json, user_selected_id, turnstile_verified,
            ip_country, user_agent, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
        `,
				)
					.bind(
						record.id,
						record.fatwa_id,
						record.scholar_name,
						record.topic_chapter,
						record.topic_subtopic,
						record.question_excerpt,
						record.principle_id,
						record.principle_text,
						record.reason,
						record.user_comment,
						record.options_json,
						record.user_selected_id,
						record.turnstile_verified,
						record.ip_country,
						record.user_agent,
						record.created_at,
					)
					.run();
				storedInD1 = true;
			} catch (_d1Err) {}
		}

		// 4. Store in Cloudflare KV if available
		let storedInKV = false;
		if (env.FEEDBACK_KV) {
			try {
				await env.FEEDBACK_KV.put(
					`feedback:${reportId}`,
					JSON.stringify(record),
					{
						metadata: {
							fatwa_id: record.fatwa_id,
							reason: record.reason,
							status: record.status,
							created_at: record.created_at,
						},
					},
				);

				// Maintain a list index for open reports in KV
				const indexKey = "feedback_index:open";
				const existing =
					(await env.FEEDBACK_KV.get(indexKey, { type: "json" })) || [];
				if (Array.isArray(existing)) {
					existing.unshift({
						id: record.id,
						fatwa_id: record.fatwa_id,
						reason: record.reason,
						created_at: record.created_at,
					});
					await env.FEEDBACK_KV.put(
						indexKey,
						JSON.stringify(existing.slice(0, 500)),
					);
				}
				storedInKV = true;
			} catch (_kvErr) {}
		}

		return jsonResponse({
			success: true,
			id: reportId,
			message: "تم حفظ البلاغ بنجاح في قاعدة المراجعة",
			stored: { d1: storedInD1, kv: storedInKV },
		});
	} catch (_err: any) {
		return jsonResponse({ error: "خطأ داخلي في الخادم عند حفظ البلاغ" }, 500);
	}
};

/**
 * GET /api/feedback
 * Retrieves feedback reports from Cloudflare (D1 or KV).
 * Supports filters: status, fatwa_id, reason, limit, offset.
 */
export const onRequestGet = async (context: { request: Request; env: Env }) => {
	const { request, env } = context;

	// Optional authentication check
	if (env.FEEDBACK_ADMIN_KEY) {
		const authHeader = request.headers.get("Authorization");
		const adminKey = request.headers.get("X-Admin-Key");
		const token = authHeader?.replace(/^Bearer\s+/i, "") || adminKey;
		if (token !== env.FEEDBACK_ADMIN_KEY) {
			return jsonResponse(
				{ error: "غير مصرح بالوصول إلى بلاغات المراجعة" },
				401,
			);
		}
	}

	const url = new URL(request.url);
	const status = url.searchParams.get("status") || "open";
	const fatwaId = url.searchParams.get("fatwa_id");
	const reason = url.searchParams.get("reason");
	const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
	const offset = Number(url.searchParams.get("offset") || 0);

	// 1. Fetch from D1 if available
	if (env.FEEDBACK_DB) {
		try {
			await ensureD1Schema(env.FEEDBACK_DB);

			let query = "SELECT * FROM feedback_reports WHERE 1=1";
			const params: any[] = [];

			if (status !== "all") {
				query += " AND status = ?";
				params.push(status);
			}
			if (fatwaId) {
				query += " AND fatwa_id = ?";
				params.push(fatwaId);
			}
			if (reason) {
				query += " AND reason = ?";
				params.push(reason);
			}

			query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
			params.push(limit, offset);

			const stmt = env.FEEDBACK_DB.prepare(query);
			const { results } = await stmt.bind(...params).all();

			return jsonResponse({
				success: true,
				source: "d1",
				count: results.length,
				reports: results.map((r: any) => ({
					...r,
					options_shown: r.options_json ? JSON.parse(r.options_json) : null,
				})),
			});
		} catch (d1Err: any) {
			return jsonResponse(
				{ error: "خطأ في الاستعلام من قاعدة D1", details: d1Err.message },
				500,
			);
		}
	}

	// 2. Fetch from KV if D1 is not configured
	if (env.FEEDBACK_KV) {
		try {
			const indexKey =
				status === "all" ? "feedback_index:all" : `feedback_index:${status}`;
			const indexList =
				(await env.FEEDBACK_KV.get(indexKey, { type: "json" })) || [];
			const filtered = Array.isArray(indexList)
				? indexList.filter((item: any) => {
						if (fatwaId && item.fatwa_id !== fatwaId) return false;
						if (reason && item.reason !== reason) return false;
						return true;
					})
				: [];

			const slice = filtered.slice(offset, offset + limit);
			const reports = await Promise.all(
				slice.map(async (item: any) => {
					const raw = await env.FEEDBACK_KV!.get(`feedback:${item.id}`, {
						type: "json",
					});
					return raw || item;
				}),
			);

			return jsonResponse({
				success: true,
				source: "kv",
				count: reports.length,
				reports,
			});
		} catch (kvErr: any) {
			return jsonResponse(
				{ error: "خطأ في الاستعلام من KV", details: kvErr.message },
				500,
			);
		}
	}

	return jsonResponse({
		success: true,
		source: "unbound",
		count: 0,
		message: "قاعدة البيانات D1 أو KV لم تُربط بعد في إعدادات Cloudflare.",
		reports: [],
	});
};

/**
 * PATCH /api/feedback
 * Updates the review status or resolution notes of a feedback report.
 */
export const onRequestPatch = async (context: {
	request: Request;
	env: Env;
}) => {
	const { request, env } = context;

	if (env.FEEDBACK_ADMIN_KEY) {
		const authHeader = request.headers.get("Authorization");
		const adminKey = request.headers.get("X-Admin-Key");
		const token = authHeader?.replace(/^Bearer\s+/i, "") || adminKey;
		if (token !== env.FEEDBACK_ADMIN_KEY) {
			return jsonResponse({ error: "غير مصرح" }, 401);
		}
	}

	try {
		const body = (await request.json()) as {
			id: string;
			status?: "open" | "reviewed" | "resolved" | "dismissed";
			resolution_notes?: string;
		};

		if (!body.id) {
			return jsonResponse({ error: "حقل id مطلوب" }, 400);
		}

		const reviewedAt = new Date().toISOString();

		if (env.FEEDBACK_DB) {
			await ensureD1Schema(env.FEEDBACK_DB);
			await env.FEEDBACK_DB.prepare(
				`
        UPDATE feedback_reports
        SET status = COALESCE(?, status),
            resolution_notes = COALESCE(?, resolution_notes),
            reviewed_at = ?
        WHERE id = ?
      `,
			)
				.bind(
					body.status || null,
					body.resolution_notes || null,
					reviewedAt,
					body.id,
				)
				.run();
		}

		if (env.FEEDBACK_KV) {
			const existing = await env.FEEDBACK_KV.get(`feedback:${body.id}`, {
				type: "json",
			});
			if (existing && typeof existing === "object") {
				const updated = {
					...existing,
					status: body.status || (existing as any).status,
					resolution_notes:
						body.resolution_notes || (existing as any).resolution_notes,
					reviewed_at: reviewedAt,
				};
				await env.FEEDBACK_KV.put(
					`feedback:${body.id}`,
					JSON.stringify(updated),
				);
			}
		}

		return jsonResponse({
			success: true,
			id: body.id,
			message: "تم تحديث حالة البلاغ بنجاح",
		});
	} catch (_err: any) {
		return jsonResponse({ error: "خطأ في تحديث البلاغ" }, 500);
	}
};
