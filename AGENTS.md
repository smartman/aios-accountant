<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Official API Docs

Verified on 2026-04-15:

- Merit Aktiva API docs: https://api.merit.ee/merit-aktiva-api/
- SmartAccounts API docs: https://www.smartaccounts.eu/uuskodu2015/wp-content/uploads/2025/04/SmartAccounts_API_latest.pdf

# Local Test Credentials

Local test credentials are stored in the repo's `.env.local` file and should be read from there instead of being hardcoded anywhere else.

For SmartAccounts import testing, `.env.local` currently contains these local test variables:

- `SMARTACCOUNTS_DEV_API_KEY`
- `SMARTACCOUNTS_DEV_API_SECRET`
- `DEV_AUTH_EMAIL`
- `DEV_AUTH_PASSWORD`

The file also contains the app-level keys needed for local imports, including `OPENROUTER_*` and `WORKOS_*` variables.

Do not add or rely on ad-hoc import scripts for local testing in this repo.

Invoice import testing should be done through the app UI using Playwright MCP, with credentials read from `.env.local`.

`npm run dev` is started externally for this repo. Assume the existing dev server will automatically pick up file changes, and do not ask for or suggest restarting it unless the user explicitly requests that restart.

Keep the Playwright MCP browser session and browser window open while testing so progress stays visible to the user. Do not close the browser session or browser window between steps unless the user explicitly asks or the work is fully complete.

Do not print secret values in logs, test output, or commit them into tracked files.

# Task Completion Requirements

After finishing every task, ensure the repo is in a passing state before considering the work complete. Run each of the following commands locally and confirm they all succeed:

- `npm test` — all relevant tests must pass, and unit test coverage must be at least 90% for lines, functions, branches, and statements.
- `npm run typecheck` — typechecking must pass.
- `npm run format:check` — formatting checks must pass.
- `npm run lint` — linting must pass.
- `npm run build` — the production build must succeed.

# Linting Requirements

The lint configuration must register each of the following as an error when violated:

- Max file length: 500 lines
- Max function length: 120 lines
- Max complexity: 15
- Max nesting depth: 4
