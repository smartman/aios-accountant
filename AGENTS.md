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

The file also contains the app-level keys needed for local imports, including `OPENAI_*` and `WORKOS_*` variables.

Do not add or rely on ad-hoc import scripts for local testing in this repo.

Invoice import testing should be done through the app UI using Playwright MCP, with credentials read from `.env.local`.

For invoice file upload tests, do not try to control the native macOS file picker. Native file chooser dialogs are outside the browser DOM and are not reliable through browser automation. Use Playwright's controlled upload APIs instead, verified via Context7 Playwright docs on 2026-04-25:

- Prefer setting the app's hidden file input directly:
  - `await page.locator('input#invoice-file[type="file"]').setInputFiles('/absolute/path/to/invoice.jpg')`
  - For multiple files, pass an array of absolute paths.
- If the input is created only after clicking an upload control, start waiting for the chooser before clicking, then set files on the returned chooser:
  - `const chooserPromise = page.waitForEvent('filechooser')`
  - `await page.getByText('Upload file').click()`
  - `const chooser = await chooserPromise`
  - `await chooser.setFiles('/absolute/path/to/invoice.jpg')`
- If a Browser Use in-app session does not expose `setInputFiles` or file chooser file-setting, switch to Playwright MCP for upload testing instead of using the OS dialog.
- Do not add localhost helper servers or injected file-upload workarounds unless the user explicitly approves that workaround for the current task.

If actions or end-to-end behavior are tested for accounting-provider features, sanity and correctness checks must be performed for all supported accounting providers, not just one.

`npm run dev` is started externally for this repo. Assume the existing dev server will automatically pick up file changes, and do not ask for or suggest restarting it unless the user explicitly requests that restart.

Keep the Playwright MCP browser session and browser window open while testing so progress stays visible to the user. Do not close the browser session or browser window between steps unless the user explicitly asks or the work is fully complete.

Do not print secret values in logs, test output, or commit them into tracked files.

# Task Completion Requirements

After finishing every task, ensure the repo is in a passing state before considering the work complete. Run each of the following commands locally and confirm they all succeed:

- `npm audit` — dependency vulnerabilities must be resolved or explicitly reviewed and accepted by the user.
- `npm test` — all relevant tests must pass, and unit test coverage must be at least 90% for lines, functions, branches, and statements.
- `npm run typecheck` — typechecking must pass.
- `npm run format:check` — formatting checks must pass.
- `npm run lint` — linting must pass.
- `npm run build` — the production build must succeed.

# Linting Requirements

Do not change ESLint rules, thresholds, ignores, or lint-policy behavior unless the user explicitly asks for that change.

The lint configuration must register each of the following as an error when violated:

- Max file length: 500 lines
- Max function length: 120 lines
- Max complexity: 15
- Max nesting depth: 4

# Architecture Expectations

- Prefer best-practice modularization in all aspects of the codebase.
- Group `src/lib` by domain or provider instead of allowing flat top-level file growth.
- Keep entrypoints thin and split provider-specific logic, API clients, payload builders, helpers, and tests into focused modules.
- When a domain accumulates many related files, introduce or extend a subfolder structure before adding more root-level files.
