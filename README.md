# AI Accountant

AI Accountant increases accountant productivity by 10–100×. It handles all accountant tasks under human supervision — from invoice extraction and classification to posting and payment reconciliation.

## What it does

- Upload a supplier invoice as a PDF or image
- AI extracts and classifies the document automatically
- Fetches the active provider chart of accounts and tax codes
- Picks the best matching purchase account for the invoice rows
- Creates the vendor invoice in SmartAccounts or Merit
- Creates a payment when the invoice is already paid
- Attaches the original uploaded file when the provider supports it

## Authentication

This app uses [WorkOS AuthKit](https://workos.com/docs/user-management/authkit) for authentication. Users must sign in before uploading invoices.

### WorkOS setup

#### 1. Get your API key

- In the left sidebar click **API Keys**
- Copy the **Secret Key** — this is your `WORKOS_API_KEY`
- The **Client ID** is shown at the top of the same page — this is your `WORKOS_CLIENT_ID`

#### 2. Configure Redirects

In the left sidebar click **Redirects**. You need to configure these:

- **Redirect URIs** → Click "Edit redirect URIs" → add `http://localhost:3000/api/auth/callback` (mark as Default). For production also add `https://yourdomain.com/api/auth/callback`
- **App homepage URL** → Click "Edit app homepage URL" → set `http://localhost:3000` (production: `https://yourdomain.com`)
- **Sign-in endpoint** → Click "Edit sign-in endpoint" → set `http://localhost:3000/api/auth/signin` — this is needed when sign-in is initiated externally (e.g. from an email link)
- **Sign-out redirect** → Click "Add sign-out redirect" → set `http://localhost:3000` so users land on the landing page after signing out

#### 3. Enable AuthKit (sign-in UI)

- In the left sidebar click **Authentication**
- Make sure **AuthKit** is enabled as a sign-in method
- Optionally configure which providers (email/password, Google, etc.) you want to allow

#### 4. (Optional) Customize branding

- In the left sidebar click **Branding**
- Set your logo, colors, and app name to match AI Accountant

#### 5. Switch to Production when ready

- The environment switcher at the top of the dashboard shows **Staging** — use this for development
- When going live, switch to **Production** and repeat steps 1–2 to get production credentials

## Required environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
# Database
DATABASE_URL=postgresql://accounting:accounting@localhost:5432/accounting?schema=public
CREDENTIAL_ENCRYPTION_KEY=change-me-use-openssl-rand-base64-32

# WorkOS authentication
WORKOS_API_KEY=sk_example_key
WORKOS_CLIENT_ID=client_example_id
WORKOS_COOKIE_PASSWORD=change-me-use-openssl-rand-base64-32

# AI extraction
OPENROUTER_API_KEY=sk-or-v1-example
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_ARTICLE_MATCH_MODEL=openai/gpt-5.4-mini
OPENROUTER_APP_TITLE=AI Accountant
```

> **Tip:** Generate secrets for `CREDENTIAL_ENCRYPTION_KEY` and `WORKOS_COOKIE_PASSWORD` with:
>
> ```bash
> openssl rand -base64 32
> ```

## Development

### 1. Choose a local database

Option A: run Postgres 17 in Docker

```bash
docker compose up -d
```

Option B: use Neon locally or a remote Neon project

- Create or select a Neon database with the Neon CLI
- Set `DATABASE_URL` in `.env.local` to the Neon connection string
- Keep `sslmode=require` in the URL

### 2. Generate Prisma client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 3. Start the app

```bash
npm run dev
```

Users sign in with WorkOS, then configure either their own SmartAccounts credentials or their own Merit API credentials from the dashboard. Credentials are validated before they are saved and stored encrypted in Postgres.

## Article Detection

When the importer suggests an existing accounting article for an invoice row, it applies these rules in order:

1. Only active purchase articles are considered.
2. The primary matcher is AI. For each invoice row, the app sends the row description, source article code, resolved account/VAT/unit, the active article catalog, and a vendor-history summary to OpenRouter.
3. The AI must return one of three outcomes for each row:
   - `clear`: one existing article is clearly the best match
   - `ambiguous`: more than one existing article is still plausible
   - `missing`: none of the existing articles fit well enough
4. The AI is instructed to use row-description meaning first, with vendor history and accounting metadata as supporting evidence.
5. The row stays on manual review unless the AI returns a `clear` match.
6. A deterministic matcher still ranks candidate articles underneath the AI decision so the UI can show review options and so the app has a fallback if the AI matcher is unavailable.
7. Set `OPENROUTER_ARTICLE_MATCH_MODEL` to override the article-matcher model. If it is unset, the matcher defaults to `openai/gpt-5.4-mini`.

Example: `Kontori internet märts 2025` should match an article such as `net - Internet`, because `märts 2025` is billing-period detail and `Kontori` is just extra context around the core service name.

## Notes

- SmartAccounts request timestamps are sent in the `Europe/Tallinn` timezone because their API requires Estonian time.
- SmartAccounts and Merit requests use the provider base URLs hardcoded in the app.
- Merit request authentication uses the official `apiId` + `apiKey` HMAC-SHA256 flow against the Estonian Aktiva API.
- The importer loads live account and tax metadata from the signed-in user's active provider before extraction so the AI can choose from real ledger options instead of guessing.
- If an invoice with the same vendor and invoice number already exists, the app returns that match instead of creating a duplicate invoice.
- Paid invoices create a provider-specific payment when supported by the target accounting system.
