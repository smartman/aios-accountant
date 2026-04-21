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

If actions or end-to-end behavior are tested for accounting-provider features, sanity and correctness checks must be performed for all supported accounting providers, not just one.

`npm run dev` is started externally for this repo. Assume the existing dev server will automatically pick up file changes, and do not ask for or suggest restarting it unless the user explicitly requests that restart.

Keep the Playwright MCP browser session and browser window open while testing so progress stays visible to the user. Do not close the browser session or browser window between steps unless the user explicitly asks or the work is fully complete.

Do not print secret values in logs, test output, or commit them into tracked files.

# Playwright MCP Recovery

1. Stop stale Playwright MCP processes:
   - `pkill -f '@playwright/mcp' || true`

2. Use the known-good stdio config in `~/.codex/config.toml`:
   - `@playwright/mcp@0.0.70`
   - `--isolated`
   - `--output-dir=/Users/smartman/.playwright-mcp`
   - `--output-mode=file`
   - `--save-session`
   - `--console-level=debug`

3. Do not use `--user-data-dir` together with `--isolated`.

4. Fully restart Codex so it reloads the MCP config.

5. If Playwright still fails, start the standalone HTTP server:
   - `env HOME=/Users/smartman/.codex/playwright-home XDG_CACHE_HOME=/Users/smartman/.codex/playwright-home/.cache PLAYWRIGHT_BROWSERS_PATH=/Users/smartman/.codex/playwright-browsers npx -y @playwright/mcp@0.0.70 --port 8931 --isolated --output-dir=/Users/smartman/.playwright-mcp --save-session --console-level=debug`

6. If using the HTTP fallback, set `~/.codex/config.toml` to:
   - `url = "http://127.0.0.1:8931/mcp"`
   - restart Codex again

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
