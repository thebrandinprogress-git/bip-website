# Contact form — setup guide (Brand in Progress)

The contact form is **built but switched off**. It appears on the homepage automatically
once the Turnstile site key is pasted into `src/consts.ts`.

Architecture: browser form → **Cloudflare Pages Function** (`functions/api/contact.ts`) →
**Turnstile** (spam check) → **Google Sheets** (contact log) + **Resend** (email notification).

Everything below runs on free tiers. Total time: ~20 minutes.

---

## 1. Turnstile (spam protection) — Cloudflare dashboard

1. Cloudflare dashboard → **Turnstile** → **Add widget**
2. Name: `bip contact`, hostname: `brand-in-progress.com` (also add `bip-website-8vk.pages.dev`), mode **Managed**
3. You get two keys:
   - **Site key** (public) → paste into `src/consts.ts` → `TURNSTILE_SITE_KEY`
   - **Secret key** (private) → step 4 below. Never commit it.

## 2. Google Sheets (contact log)

1. Create a blank Google Sheet, name it e.g. `BIP Website Contacts`
2. In the sheet: **Extensions → Apps Script**
3. Delete any code there and paste:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var d = JSON.parse(e.postData.contents);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Name', 'Email', 'Subject', 'Message']);
  }
  sheet.appendRow([d.timestamp, d.name, d.email, d.subject, d.message]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. **Deploy → New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize when prompted (it's your own script), then copy the **Web app URL**
   (ends in `/exec`) → this is `SHEETS_WEBHOOK_URL` for step 4.

## 3. Resend (email notification)

Quick path (no DNS needed):

1. Sign up at **resend.com** with `the.brand.in.progress@gmail.com`
2. **API Keys → Create API Key** → name `bip-contact`, **Sending access** → copy the `re_...` key (shown once)
3. Use `onboarding@resend.dev` as `CONTACT_FROM_EMAIL` — on an unverified account,
   Resend only sends to your own signup address, which is exactly where we want mail.

Better later: verify `brand-in-progress.com` in Resend (add 2–3 DNS records in Cloudflare,
set to **DNS only**), then change `CONTACT_FROM_EMAIL` to `contact@brand-in-progress.com`.

## 4. Environment variables — Cloudflare Pages

Pages project → **Settings → Variables and secrets** → add for **Production**:

| Name | Value | Type |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | secret from step 1 | Secret |
| `RESEND_API_KEY` | key from step 3 | Secret |
| `SHEETS_WEBHOOK_URL` | URL from step 2 | Secret |
| `CONTACT_TO_EMAIL` | `the.brand.in.progress@gmail.com` | Plaintext |
| `CONTACT_FROM_EMAIL` | `onboarding@resend.dev` | Plaintext |

## 5. Switch it on

Paste the Turnstile **site key** into `src/consts.ts`, commit, push. Cloudflare redeploys,
the form appears on the homepage. Send yourself a test message and check both your inbox
and the Google Sheet.
