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

- `public/templates/Camo Athlete License(1).pdf`
- `public/templates/National ID form(1).pdf`

Both current templates were inspected with:

```bash
npm run inspect:pdfs
```

They do not contain fillable PDF fields, so this version uses coordinate overlays with `pdf-lib`.

## Adjust PDF Field Mappings

Mappings live in `lib/pdf/pdfFieldMap.ts`.

`pdf-lib` coordinates start at the bottom-left of the page:

- Increase `x` to move text right.
- Increase `y` to move text up.
- Reduce `size` if text is too large.
- Add `maxWidth` for wrapped text blocks.

Run `npm run inspect:pdfs` to confirm page sizes and fillable field names after replacing a template. If a future PDF has AcroForm fields, add the exact names under `fillableFields`.

## Email Configuration

Copy `.env.example` to `.env.local` and configure server-side email credentials:

```env
BETA_MODE=true
APPLICATION_EMAIL_BETA=Kybunnylove@gmail.com
MEDICAL_EMAIL_BETA=Joesph6523@gmail.com
APPLICATION_EMAIL_PROD=info@camomma.org
MEDICAL_EMAIL_PROD=medicals@camomma.org
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="CAMO Fighter Application Helper <no-reply@example.com>"
```

Beta mode sends application documents to `APPLICATION_EMAIL_BETA` and medical documents to `MEDICAL_EMAIL_BETA`. Set `BETA_MODE=false` to use the production recipients.

Email credentials are only used in `app/api/submit-application/route.ts` and are not exposed to frontend code.

## Payment URL

Set the official CAMO payment URL with:

```env
NEXT_PUBLIC_CAMO_PAYMENT_URL=
```

If it is blank, the app shows: "Payment link has not been configured yet. Please add the official CAMO payment URL in the environment settings."

## Upload Privacy

Typed form progress is saved in browser local storage. Uploaded files are kept in memory for the active session and sent during submission; they are not committed to the repo and are not intentionally stored long term.

## Deploy To Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add the environment variables from `.env.example`.
4. Set `BETA_MODE=true` for beta testing, or `BETA_MODE=false` for production routing.
5. Add the official `NEXT_PUBLIC_CAMO_PAYMENT_URL`.
6. Deploy.

Because PDF templates are in `public/templates`, Vercel will serve them with the app.
