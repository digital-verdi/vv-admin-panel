# LibreChat Admin Panel

A browser-based management interface for [LibreChat](https://github.com/danny-avila/LibreChat). It connects to the same database as the main application and provides a GUI for tasks that would otherwise require editing `librechat.yaml` directly.

## Features

- **Configuration management** — View and edit all LibreChat settings through a dynamic, schema-driven form. New fields added to the schema appear automatically.
- **Role and group overrides** — Apply configuration overrides scoped to specific roles or groups, with a priority-based cascade that determines the final resolved value for each user.
- **Configuration YAML export/import** — Download the saved active configuration for the selected scope as a `librechat.yaml`-shaped file, or upload/paste one back in via Import YAML.
- **LLM Router (Varde)** — Manage the `vv-llm-proxy`: dynamic chat-model groups (OpenRouter egress), embeddings, PII pseudonymization — applied live, and kept in sync with the LibreChat config.
- **User and group administration** — Create and manage groups, assign roles, and control access.
- **Authentication** — Supports username/password login and OpenID SSO when enabled on the LibreChat instance.
- **Localization** — Full multi-language support for all UI strings.
- **Accessibility** — Keyboard navigable with ARIA regions, focus management, and screen reader support.

### Configuration YAML export

The **Export YAML** action (next to Import YAML on the configuration page) downloads the saved active
configuration currently shown for the selected scope:

- **Source** — the exact object the editor renders (`activeConfigValues`), across **all** tabs, not just the
  active one. For **Base**, this is the full effective config (`librechat.yaml` merged with base DB overrides);
  for a **role/group**, it is that scope's own overrides (a delta), matching import-as-profile.
- **File** — a plain `librechat.yaml`-shaped object at the root (no Varde-specific wrapper). You choose the
  `.yaml`/`.yml` filename; it is sanitized before download.
- **Normalized** — LibreChat's AppService runtime config represents unset optionals as `null` / empty-object
  stubs (e.g. `mcpServers`, `turnstile: {}`) and omits `version`, none of which the strict import schema
  accepts. The export drops those stubs and backfills the canonical `version`, so the file is a valid
  `librechat.yaml`.
- **Validated** — the generated YAML is run through the same parser as Import YAML before the download starts,
  so an exported file is always re-importable.
- **Requires** `MANAGE_CONFIGS`, and is **disabled while there are unsaved changes** (save or discard first) so
  the file is always one consistent, saved configuration.
- **Sensitive** — the file may contain API keys, credentials or internal URLs (values are never masked or
  logged). Store it securely and do not commit it. Re-importing a full Base config materializes values
  previously inherited from `librechat.yaml` as DB overrides.

### LLM Router (Varde)

The **LLM Router** page manages the Varde `vv-llm-proxy` via its admin API (`/admin/config`,
`/admin/models`), server-to-server with a separate admin Bearer (`VV_LLM_PROXY_ADMIN_KEY` →
`VV_LLM_PROXY_BASE_URL`, never exposed to the browser). Requires `MANAGE_CONFIGS`.

- **Dynamic chat-model groups** — Add / rename / reorder / delete groups. Each group has an editable
  **name** (sent verbatim to the model as the selected `model`), a **stable id** (survives renames), **1
  primary + up to 2 fallbacks**, and **legacy names** kept routable after a rename so nothing breaks.
  Exactly one **default group** drives LibreChat's title generation + default model spec.
- **Provider-explicit models (multi-provider)** — Each model in a group carries its **provider** (routing
  v3): the picker lists the merged **OpenRouter + Mistral** catalog, each option labelled with its provider,
  so a group can mix providers (e.g. a Mistral primary with an OpenRouter fallback). A **Mistral** status
  tile shows whether the proxy has a Mistral key (managed in Secret Manager — never entered here); when it
  isn't configured, Mistral models are unavailable and the proxy runs OpenRouter-only.
- **Safe rename/delete** — Renaming keeps the old name routable via legacy names; deleting a group requires
  choosing a replacement default (when it was the default) and offers to fold its names into another group.
- **LibreChat sync** — On save, the `Varde` endpoint's `models.default` + `titleModel` and the Varde model
  specs' `preset.model` are updated to match the groups. An **impact preview** shows the before→after before
  you save. The proxy is saved **first** (it accepts both current + legacy names), so a failed LibreChat
  sync never breaks routing; a **Retry LibreChat sync** action re-runs just the sync.
- **Optimistic concurrency** — The proxy config carries a revision token; a concurrent edit yields a clear
  "config changed elsewhere" prompt (409) instead of silently overwriting. If the proxy still runs the
  legacy tier API, the page shows the current routing **read-only** until the proxy is upgraded.

## Getting started

### Local development

```bash
cp .env.example .env   # then edit .env
bun install
bun dev                 # http://localhost:3000
```

### Docker

```bash
cp .env.example .env
# Set SESSION_SECRET (min 32 chars)
# Set VITE_API_BASE_URL=http://host.docker.internal:3080

docker compose up -d    # builds and starts on http://localhost:3000
docker compose down     # stop
```

> **Note:** Inside Docker, `localhost` refers to the container, not your machine.
> Use `http://host.docker.internal:3080` for `VITE_API_BASE_URL` to reach
> LibreChat running on the host.

#### Environment variables

| Variable                        | Required                            | Default                                                                          | Description                                                                                     |
| ------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PORT`                          | No                                  | `3000`                                                                           | Port the admin panel listens on                                                                 |
| `SESSION_SECRET`                | **Yes** (always required in Docker) | Dev fallback only when running `bun dev` locally; no default in the Docker image | Encryption key for sessions (min 32 chars)                                                      |
| `VITE_API_BASE_URL`             | **Yes** (Docker)                    | `http://localhost:3080` (local dev only)                                         | LibreChat API server URL; use `http://host.docker.internal:<port>` in Docker                    |
| `VITE_BASE_PATH`                | No                                  | `/`                                                                              | URL subpath to serve the panel under (e.g., `/adminpanel`). Must match at build time and runtime |
| `API_SERVER_URL`                | No                                  | Falls back to `VITE_API_BASE_URL`                                                | Server-side LibreChat API URL when the container reaches LibreChat differently than the browser |
| `ADMIN_SSO_ONLY`                | No                                  | `false`                                                                          | Hide email/password form, SSO only                                                              |
| `ADMIN_SSO_ENABLED`             | No                                  | `true`                                                                           | Set `false` to hide the SSO button (and auto-redirect) while keeping email/password login       |
| `ADMIN_SESSION_IDLE_TIMEOUT_MS` | No                                  | `1800000` (30 min)                                                               | Session idle timeout in ms                                                                      |
| `SESSION_COOKIE_SECURE`         | No                                  | `true` in production, `false` otherwise                                          | Set `false` only for plain-HTTP deployments so the browser keeps the admin session cookie       |

For OpenID SSO, the admin panel stores a short-lived PKCE verifier in the
`admin-session` cookie before redirecting to LibreChat. If the admin panel is
served over plain HTTP while running in production mode, browsers reject a
`Secure` session cookie and the callback cannot complete the PKCE exchange. In
that deployment shape, set `SESSION_COOKIE_SECURE=false` on the admin panel.
Set the same override on LibreChat itself when LibreChat is also reached over
plain HTTP, so its OAuth and auth cookies are not dropped either.

#### Standalone Docker build

```bash
docker build -t librechat-admin-panel .
docker run -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e SESSION_SECRET=your-secret-here-at-least-32-characters \
  -e VITE_API_BASE_URL=http://host.docker.internal:3080 \
  -e SESSION_COOKIE_SECURE=false \
  librechat-admin-panel

# To serve under a subpath (e.g., /adminpanel):
docker build -t librechat-admin-panel --build-arg VITE_BASE_PATH=/adminpanel .
docker run -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e SESSION_SECRET=your-secret-here-at-least-32-characters \
  -e VITE_API_BASE_URL=http://host.docker.internal:3080 \
  -e VITE_BASE_PATH=/adminpanel \
  librechat-admin-panel
```
