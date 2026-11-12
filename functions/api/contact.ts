// Cloudflare Pages Function — POST /api/contact
// Flow: verify Turnstile → append row to Google Sheet (Apps Script webhook) → send email via Resend.
// Required env vars (Cloudflare Pages → Settings → Variables and secrets):
//   TURNSTILE_SECRET_KEY (secret)  — Cloudflare Turnstile secret
//   RESEND_API_KEY      (secret)  — Resend API key
//   CONTACT_TO_EMAIL    (plain)   — destination inbox, e.g. the.brand.in.progress@gmail.com
//   CONTACT_FROM_EMAIL  (plain)   — sender, e.g. onboarding@resend.dev or a verified domain address
//   SHEETS_WEBHOOK_URL  (secret)  — Google Apps Script web-app URL (see docs/contact-form-setup.md)

interface Env {
	TURNSTILE_SECRET_KEY: string;
	RESEND_API_KEY: string;
	CONTACT_TO_EMAIL: string;
	CONTACT_FROM_EMAIL: string;
	SHEETS_WEBHOOK_URL?: string;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	let data: FormData;
	try {
		data = await request.formData();
	} catch {
		return json({ ok: false, error: 'Invalid request.' }, 400);
	}

	const name = String(data.get('name') || '').trim();
	const email = String(data.get('email') || '').trim();
	const subject = String(data.get('subject') || '').trim();
	const message = String(data.get('message') || '').trim();
	const token = String(data.get('cf-turnstile-response') || '');

	if (!name || !email || !subject || !message) {
		return json({ ok: false, error: 'Please fill in all fields.' }, 400);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return json({ ok: false, error: 'Please enter a valid email address.' }, 400);
	}
	if ([name, email, subject, message].some((v) => v.length > 4000)) {
		return json({ ok: false, error: 'Message is too long.' }, 400);
	}

	// 1. Verify Turnstile token
	const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			secret: env.TURNSTILE_SECRET_KEY,
			response: token,
		}),
	}).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));

	if (!verify.success) {
		return json({ ok: false, error: 'Spam check failed. Please try again.' }, 403);
	}

	const row = {
		timestamp: new Date().toISOString(),
		name,
		email,
		subject,
		message,
	};

	// 2. Append to Google Sheet (best effort — email is the primary channel)
	if (env.SHEETS_WEBHOOK_URL) {
		try {
			await fetch(env.SHEETS_WEBHOOK_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(row),
			});
		} catch {
			// log but don't fail the submission
		}
	}

	// 3. Send email notification via Resend
	const esc = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const resend = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: env.CONTACT_FROM_EMAIL,
			to: [env.CONTACT_TO_EMAIL],
			reply_to: email,
			subject: `[Website] ${subject}`,
			html: `<p><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;</p>
<p><strong>Subject:</strong> ${esc(subject)}</p>
<p><strong>Message:</strong></p>
<p>${esc(message).replace(/\n/g, '<br>')}</p>`,
		}),
	}).catch(() => null);

	if (!resend || !resend.ok) {
		return json({ ok: false, error: 'Could not send your message. Please email us directly.' }, 502);
	}

	return json({ ok: true });
};
