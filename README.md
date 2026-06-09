# CAMO Fighter Application Helper

Mobile-first web app for amateur MMA fighters preparing CAMO Athlete License and National MMA ID paperwork.

The app does not ask for CAMO usernames or passwords, does not log in to CAMO, and does not process payment. It collects the fighter's information once, generates completed PDFs from the bundled CAMO templates, sends the documents by email through a server-side route, and then sends the fighter to the official CAMO payment page.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

For a production check:

```bash
npm run build
```

## PDF Templates

The source templates live in:

- `public/templates/Camo Athlete License - Fillable.pdf`
- `public/templates/National ID form 0 Fillable.pdf`

Both templates contain AcroForm fields and are inspected with:

```bash
npm run inspect:pdfs
```

The app fills the forms by exact field name with `pdf-lib`, checks checkbox fields, updates field appearances, embeds a drawn signature image if one is available, and then flattens the completed PDFs before download or email. The older coordinate overlay mapping remains in the repo as an emergency fallback only.

## Adjust PDF Field Mappings

Primary field-name mappings live in `lib/pdf/pdfFieldNameMap.ts`.

Run `npm run inspect:pdfs` any time the fillable templates are replaced. If a field name in the new PDF differs from the mapping, update the corresponding entry in `lib/pdf/pdfFieldNameMap.ts` to match the exact inspected field name.

For missing fields, the safe fill helper in `lib/pdf/fillAcroForm.ts` logs a development warning instead of crashing PDF generation. Coordinate overlays in `lib/pdf/pdfFieldMap.ts` and `lib/pdf/generatePdf.ts` can still be used for an emergency fallback. `pdf-lib` coordinates start at the bottom-left of the page:

- Increase `x` to move text right.
- Increase `y` to move text up.
- Reduce `size` if text is too large.
- Add `maxWidth` for wrapped text blocks.

## Continuation Sheets

The athlete license form has limited official fields for fight history and disclosure entries. When the applicant has more rows than fit, or an entry is too long for the official field area, `lib/pdf/generateContinuationSheets.ts` creates letter-size continuation pages with applicant name, DOB, section headings, and table-style rows.

Continuation pages are appended to the completed Athlete License PDF so the application email still contains one completed athlete-license attachment.

## Email Configuration

Copy `.env.example` to `.env.local` and configure server-side Resend email credentials:

```env
BETA_MODE=true
RESEND_API_KEY=
EMAIL_FROM="CAMO Fighter Application Helper <no-reply@example.com>"
LICENSE_EMAIL_TO=
MEDICAL_EMAIL_TO=
```

Application documents, headshot, photo ID, and any additional documents are sent to `LICENSE_EMAIL_TO`. Blood work, physical, and Cardio/EKG files are sent to `MEDICAL_EMAIL_TO`. `BETA_MODE=true` adds a beta/testing routing note to the email body.

`RESEND_API_KEY` is only used by server-side email code and is not exposed to frontend code.

## Payment URL

The app links fighters to the official CAMO athlete payment page:

```text
https://camo-mma.myshopify.com/collections/athletes
```

Payment remains outside this app. Document submission still works normally without collecting payment.

## Upload Privacy

Typed form progress is saved in browser local storage. Uploaded files are kept in memory for the active session and sent during submission; they are not committed to the repo and are not intentionally stored long term.

## Deploy To Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add the environment variables from `.env.example`.
4. Set `BETA_MODE=true` for beta testing, or `BETA_MODE=false` for production routing.
5. Deploy.

Because PDF templates are in `public/templates`, Vercel will serve them with the app.

## Post-Import Beta Checklist

After importing the GitHub project into Vercel:

1. Confirm the deployment URL loads.
2. Keep `BETA_MODE=true`.
3. Add `RESEND_API_KEY`, `EMAIL_FROM`, `LICENSE_EMAIL_TO`, and `MEDICAL_EMAIL_TO` in Vercel Project Settings.
4. Check `/api/config-status`; it returns booleans for beta mode and email configuration without exposing secrets.
5. Submit one test application with harmless test files before sharing the beta link.
