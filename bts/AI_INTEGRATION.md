# Valamm AI integration (Gemini on Vertex AI)

Extracted from the source code and deployment configuration of this repository. Nothing here is invented: where the
repository has no value (for example the UAT and PROD project ids), this document says so. No secret values are included.

## 1. Architecture

```
Calling service (e.g. isv-onboarding API)
   │  POST {AI_GATEWAY_URL}/ai/generate        JSON: prompt, system, model, max_tokens, temperature, ...
   │  header X-Valamm-Internal: <INTERNAL_TOKEN>   (cloud only; added automatically by valamm_core)
   ▼
Valamm AI Gateway  (services/ai/api, FastAPI)  local :8005, Cloud Run :8080
   │  provider chosen by AI_PROVIDER (= gemini)
   │  google-genai SDK, genai.Client(vertexai=True, project=AI_VERTEX_PROJECT, location=AI_VERTEX_LOCATION)
   │  credentials: Application Default Credentials (no API key)
   ▼
Google Vertex AI  →  Gemini model (AI_DEFAULT_MODEL, or the model named in the request)
```

Rules the code follows:
- **Services never call a model SDK directly.** Every service calls the gateway over HTTP
  (`services/ai/api/pyproject.toml`: "Other slices call this gateway, never a provider SDK directly").
- **The provider is swapped in the gateway's settings only** (`AI_PROVIDER`); callers do not change.
- **No API key for Google.** The Gemini provider authenticates with Application Default Credentials (ADC), "per org
  policy" (`services/ai/api/app/providers/gemini.py`).

## 2. Source files

| File | Role |
|---|---|
| `services/ai/api/app/main.py` | FastAPI app "Valamm AI Gateway" 0.1.0; `/healthz`; `auth.install(app, internal_only=True)`; CORS |
| `services/ai/api/app/routes/ai.py` | `GET /ai/info`, `POST /ai/generate`, `POST /ai/embed` |
| `services/ai/api/app/schemas.py` | Request and response models |
| `services/ai/api/app/config.py` | `AISettings` (env prefix `AI_`, reads `.env`) |
| `services/ai/api/app/providers/__init__.py` | `get_provider()`: mock, groq, anthropic, vertex, gemini, bedrock |
| `services/ai/api/app/providers/gemini.py` | Gemini on Vertex AI (the active provider) |
| `services/ai/api/app/providers/vertex.py` | Claude on Vertex AI (`AI_PROVIDER=vertex`; not active) |
| `packages/core/valamm_core/auth.py` | Caller authentication, `X-Valamm-Internal` header, `install_internal_calls()` |
| `packages/core/valamm_core/plain_text.py` | `plain_dashes()`: applied to every generated text |
| `packages/core/valamm_core/ai_client.py` | Shared async client for the gateway (`ai.generate`, `ai.embed`, `ai.info`) |
| `services/isv-onboarding/api/app/chat/gateway.py` | Reference caller: ISV Onboarding's chat |
| `services/isv-onboarding/api/app/config.py` | Reference caller settings (`AI_GATEWAY_URL`, `CHAT_AI_*`) |
| `services/marketplace-discovery/api/app/div_ai.py` | A second caller that reuses ISV Onboarding's settings |
| `infra/docker/api.Dockerfile`, `infra/docker/requirements.txt` | Image and pinned dependencies |
| `infra/terraform/0{1_DEV,2_UAT,3_PROD}/...` | Cloud Run, service accounts, enabled APIs, Secret Manager |

## 3. Gateway endpoints

Base URL: `AI_GATEWAY_URL` (local `http://localhost:8005`; cloud `service://ai-gateway`, resolved by Terraform to the
Cloud Run URL of the service `${name_prefix}-ai-gateway`).

| Method and path | Purpose | Response |
|---|---|---|
| `GET /healthz` | Liveness | `{"status": "ok", "provider": "<AI_PROVIDER>"}` |
| `GET /ai/info` | Active provider and model | `{"provider": "gemini", "model": "gemini-2.5-flash", "environment": "local"}` (on error: `{"provider", "model": null, "error"}`) |
| `POST /ai/generate` | Text generation | `GenerateResult` (below) |
| `POST /ai/embed` | Embeddings | The Gemini provider does not implement embeddings: **501** |
| `GET /docs`, `/redoc` | API docs | Removed when sign-in is on (`AUTH_MODE=identity_platform`) |

### 3.1 `POST /ai/generate` request (`GenerateRequest`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `prompt` | string or null | null | The user prompt. `prompt` or `messages` is required (else **422** "Provide 'prompt' or 'messages'") |
| `messages` | list of `{role, content}` or null | null | Conversation; `assistant` maps to Gemini role `model`, anything else to `user` |
| `system` | string or null | null | System instruction |
| `model` | string or null | null | Model to use; null = gateway default (`AI_DEFAULT_MODEL`) |
| `max_tokens` | int or null | null | Answer budget; null = `AI_MAX_TOKENS` (see 4.2 for the real ceiling) |
| `temperature` | float or null | null | null = `AI_TEMPERATURE` |
| `web_search` | bool | false | Gemini: Google Search grounding, returns `sources` and `[n]` markers |
| `provider` | string or null | null | Use another provider for this call; null = `AI_PROVIDER` |
| `max_searches` | int 1 to 20 | 5 | Used by the Claude providers' web search |
| `thinking` | string or null | null | `minimal`, `low`, `medium`, `high`; applied only to models starting `gemini-3` |

Example (the shape ISV Onboarding sends):
```json
{
  "prompt": "…",
  "system": "…",
  "max_tokens": 4096,
  "temperature": 0.35,
  "model": "gemini-2.5-pro"
}
```
`model` is sent only when the caller's setting is non-empty; `thinking` only when the caller passes one.

### 3.2 Response (`GenerateResult`)

```json
{
  "text": "…",
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "usage": {"input_tokens": 123, "output_tokens": 456},
  "sources": []
}
```
`sources` is filled only with `web_search`: `{n, url, title, page_age}`; Google's redirect links are resolved to the
publisher URL.

### 3.3 Errors

| Status | When |
|---|---|
| 422 | Neither `prompt` nor `messages` |
| 401 / 403 | Sign-in on and the caller has no valid `X-Valamm-Internal` token: 403 "Only Valamm services may call this API." |
| 501 | Operation not supported by the provider (e.g. embeddings on Gemini) |
| 502 | The provider failed: `{"detail": "The AI provider did not answer. Try again in a minute."}`; the gateway logs model, max_tokens, prompt length and the error |

## 4. Gemini provider behaviour (`app/providers/gemini.py`)

### 4.1 Client and authentication
```python
from google import genai
client = genai.Client(vertexai=True, project=ai_settings.vertex_project, location=ai_settings.vertex_location)
resp = await client.aio.models.generate_content(model=model, contents=contents, config=config)
```
Only project and location are passed. The SDK finds credentials through ADC: locally the developer's
`gcloud auth application-default login`, on Cloud Run the service's attached service account.

### 4.2 Model and token rules
- **Model choice:** a requested name starting with `gemini` is used as is. Claude-style names are mapped:
  contains `opus` → `gemini-4-argon`, `sonnet` → `gemini-3.1-pro-preview`, `haiku` → `gemini-2.5-flash`. Anything else
  → the default (`AI_DEFAULT_MODEL`, or `gemini-2.5-flash` when that is blank).
- **Output budget:** `min(max(max_tokens or AI_MAX_TOKENS, 4096) + 8192, 65535)`. Gemini 2.5 counts thinking tokens
  against the output budget, so the gateway adds 8192 tokens of headroom and never goes below 4096 + 8192.
- **Empty answer at the limit:** if the reply is empty and finished on `MAX_TOKENS`, the call is repeated once with
  three times the budget (capped at 65535).
- **Temperature:** request value, else `AI_TEMPERATURE`.
- **Thinking level:** only for `gemini-3*` models and only `minimal|low|medium|high`.
- **Web search:** `tools=[Tool(google_search=GoogleSearch())]`.

### 4.3 Retries
Up to 4 attempts on transient errors (429, resource exhausted, quota, 500, 502, 503, 504, unavailable, internal,
deadline, overloaded, connection, timeout). Delay `min(1.5 × 2^attempt, 8 s) + up to 0.5 s` jitter. Auth errors, 400s
and safety blocks fail at once.

### 4.4 Post-processing (all providers)
`valamm_core.plain_text.plain_dashes()` replaces long dashes in every reply (Valamm writes no em or en dashes).

## 5. Authentication

There are two separate links, and both must work.

### 5.1 Gateway → Vertex AI (Google credentials)
| Where | Identity | Set up by |
|---|---|---|
| Local development | The developer's Google user (ADC file `%APPDATA%\gcloud\application_default_credentials.json` on Windows, `~/.config/gcloud/application_default_credentials.json` elsewhere; `type: authorized_user`) | `gcloud auth application-default login` |
| Cloud Run DEV | Service account `valamm-app-runtime` | `infra/terraform/01_DEV/service_accounts` |
| Cloud Run UAT | Service account `valamm-uat-run` | `infra/terraform/02_UAT/service_accounts` |
| Cloud Run PROD | Service account `valamm-prod-run` | `infra/terraform/03_PROD/service_accounts` |

Each of those service accounts has the project role **`roles/aiplatform.user`**, and each environment enables the API
**`aiplatform.googleapis.com`** (`project_services`). No Google API key is used anywhere in this path.

### 5.2 Calling service → Gateway (Valamm internal token)
`app/main.py` installs `valamm_core.auth` with `internal_only=True`:
- `AUTH_MODE=off` (the default, local development): every request is allowed; no header needed.
- `AUTH_MODE=identity_platform` (cloud, set through Terraform `signin_env` when the environment has a domain): every
  request must carry `X-Valamm-Internal: <INTERNAL_TOKEN>`, compared in constant time with the gateway's own
  `INTERNAL_TOKEN`. Signed-in end users are refused (403): only services may call.
- Callers do not add the header by hand: `valamm_core.auth.install()` (called by every Valamm API) runs
  `install_internal_calls()`, which patches `httpx` so that **every request to a URL listed in `INTERNAL_URLS`** carries
  the header. Requests to any other host never get the token.
- In Terraform, `INTERNAL_TOKEN` is injected from Secret Manager (`common_secrets`) into every non-web service, and
  `INTERNAL_URLS = "internal-urls://"` resolves to every service's Cloud Run URL.

## 6. Configuration

### 6.1 Gateway (`services/ai/api/.env`, prefix `AI_`)

| Variable | Code default | Local `.env` | DEV (Cloud Run) | UAT | PROD |
|---|---|---|---|---|---|
| `AI_API_PORT` | 8005 | 8005 | (container `PORT=8080`) | same | same |
| `AI_ENVIRONMENT` | local | local | production | production | production |
| `AI_PROVIDER` | mock | **gemini** | gemini | gemini | gemini |
| `AI_DEFAULT_MODEL` | "" | gemini-2.5-flash | gemini-3.1-pro-preview | gemini-2.5-flash | gemini-2.5-flash |
| `AI_VERTEX_PROJECT` | none | project-8ce5ae3e-81f4-4585-b74 | `project://id` (= project-8ce5ae3e-81f4-4585-b74) | `project://id` (repo: REPLACE_WITH_UAT_PROJECT_ID) | `project://id` (repo: REPLACE_WITH_PROD_PROJECT_ID) |
| `AI_VERTEX_LOCATION` | us | asia-south1 | global | global | global |
| `AI_MAX_TOKENS` | 1024 | 1024 | 1024 | 1024 | 1024 |
| `AI_TEMPERATURE` | 0.4 | 0.4 | 0.4 | 0.4 | 0.4 |
| `AI_VERTEX_MODEL` | claude-3-5-sonnet-v2@20241022 | same | not set | not set | not set |

Unused by the Gemini provider (other providers): `AI_ANTHROPIC_API_KEY`, `AI_GROQ_API_KEY`, `AI_GROQ_MODEL`,
`AI_GROQ_BASE_URL`, `AI_AWS_REGION`, `AI_BEDROCK_MODEL_ID`.

Also read by the gateway through `valamm_core.auth`: `AUTH_MODE`, `INTERNAL_TOKEN`, `INTERNAL_URLS` (cloud).

### 6.2 Calling service: ISV Onboarding (`services/isv-onboarding/api/.env`)

| Variable | Code default | Local `.env` | DEV | UAT | PROD |
|---|---|---|---|---|---|
| `AI_GATEWAY_URL` | http://localhost:8005 | http://localhost:8005 | `service://ai-gateway` | same | same |
| `CHAT_AI_MODEL` | "" (gateway default) | "" | gemini-4-argon | gemini-2.5-pro | gemini-2.5-pro |
| `CHAT_AI_DOC_MODEL` | "" | not set | gemini-3.1-pro-preview | not set | not set |
| `CHAT_RECOMMEND_MODEL` | "" | not set | not set | not set | not set |
| `CHAT_AI_ENABLED` | true | true | true | true | true |
| `CHAT_AI_TIMEOUT` (s) | 30.0 | 30.0 | 90.0 | 60.0 | 60.0 |
| `CHAT_AI_MAX_TOKENS` | 4096 | 320 | 4096 | 4096 | 4096 |
| `CHAT_AI_SUMMARY_MAX_TOKENS` | 300 | 300 | 300 | 300 | 300 |
| `CHAT_AI_TEMPERATURE` | 0.35 | 0.35 | 0.35 | 0.35 | 0.35 |
| `CHAT_AI_DOC_TIMEOUT` (s) | 180.0 | not set | 180.0 | 180.0 | 180.0 |
| `CHAT_AI_DOC_MAX_TOKENS` | 32768 | not set | 8192 | 8192 | 8192 |
| `CHAT_AI_CLASSIFY_MAX_TOKENS` | 8192 | not set | 8192 | 8192 | 8192 |
| `CHAT_MIN_CONFIDENCE` | 0.70 | (example: 0.70) | | | |

"not set" means the code default applies. Shared cloud variables for every API (`common_env`): `API_PORT=8080`,
`ENVIRONMENT=production`, `AI_GATEWAY_URL=service://ai-gateway`.

### 6.3 How the reference caller behaves (`isv-onboarding/api/app/chat/gateway.py`)
- `enabled()` = `CHAT_AI_ENABLED and AI_GATEWAY_URL`.
- One `httpx.AsyncClient(timeout=CHAT_AI_TIMEOUT)` POST per call to `{AI_GATEWAY_URL}/ai/generate`.
- Per-purpose overrides: document reading uses `CHAT_AI_DOC_TIMEOUT`, `CHAT_AI_DOC_MAX_TOKENS`, `CHAT_AI_DOC_MODEL`;
  classification uses `CHAT_AI_CLASSIFY_MAX_TOKENS` and temperature 0.0.
- Every function is exception-safe: any failure (gateway down, 401/403, 429, timeout, non-JSON) returns `None`, and the
  chat stores the user's raw words. The chat must complete with no AI at all.
- Replies are parsed with a tolerant JSON extractor (code fences and prose around the JSON are accepted).

## 7. Dependencies (exact versions)

From `infra/docker/requirements.txt` (the image) and the local virtual environment:

| Package | Version | Used for |
|---|---|---|
| Python | 3.14-slim (image), 3.12.10 (local venv); `requires-python >= 3.12` | runtime |
| google-genai | 2.14.0 | Gemini on Vertex AI (`from google import genai`) |
| google-auth | 2.56.2 (image), 2.56.3 (local) | ADC |
| fastapi | 0.139.0 | gateway |
| starlette | 1.3.1 | gateway |
| uvicorn | 0.51.0 | server |
| pydantic | 2.13.4 | schemas |
| pydantic-settings | 2.14.2 | settings |
| httpx | 0.28.1 | calls between services; grounding redirects |
| structlog | 26.1.0 | logging |
| anthropic | 0.120.0 | Claude providers (not active) |
| boto3 | 1.43.44 | Bedrock provider (not active) |
| valamm-core | local package `packages/core` | auth, plain_dashes, ai_client |

Note: `services/ai/api/pyproject.toml` does not list `google-genai`; it is installed from the shared
`infra/docker/requirements.txt` (and `requirements-lock.txt`), which every API image uses.

## 8. Deployment (Google Cloud Run, Terraform)

- **Image:** `infra/docker/api.Dockerfile` with build arg `SERVICE=ai` (`cloud_build` key `ai-gateway`,
  `WITH_CHROMIUM=false`). Installs `infra/docker/requirements.txt`, then `packages/core` with `--no-deps`, copies
  `services/ai/api/`, runs as uid 10001, `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers
  --forwarded-allow-ips="*" --no-server-header`, `PORT=8080`.
- **Cloud Run service** `${name_prefix}-ai-gateway` (DEV `valamm-ai-gateway`; UAT `valamm-uat-ai-gateway`; PROD
  `valamm-prod-ai-gateway`): `timeout 3600s`, `startup_failure_threshold 60`, `max_instances 5`, the env in 6.1, the
  service account in 5.1, plus `common_secrets` (`INTERNAL_TOKEN`).
- **Access:** non-web services use `INGRESS_TRAFFIC_ALL` and `roles/run.invoker` for `allUsers`; protection is the
  internal token (5.2).
- **Region / project:** DEV `project-8ce5ae3e-81f4-4585-b74`, region `asia-south1`; UAT and PROD project ids are
  placeholders in the repository (`REPLACE_WITH_UAT_PROJECT_ID`, `REPLACE_WITH_PROD_PROJECT_ID`).
- **Enabled APIs (each environment):** `aiplatform.googleapis.com` (plus run, iam, secretmanager and others).
- `infra/terraform/deploy.sh` deploys the components; see `infra/terraform/README.md`.

## 9. Observations found while extracting (no changes made)

1. **Vertex location differs:** local `asia-south1`, cloud `global`. Newer and preview models (for example
   `gemini-3.1-pro-preview`) are served on `global`; a regional location may not offer them.
2. **Local quota project:** the local ADC file's `quota_project_id` is the project number `159401898560`, while calls go
   to `project-8ce5ae3e-81f4-4585-b74`. It works today. If Google reports quota or "API not enabled" errors, align them
   with `gcloud auth application-default set-quota-project project-8ce5ae3e-81f4-4585-b74`.
3. **The gateway is public when sign-in is off:** Cloud Run allows `allUsers`, and the internal token is only checked
   when `AUTH_MODE=identity_platform`, which Terraform sets only when the environment has a `domain`. DEV, UAT and PROD
   all set a domain today.
4. **Different models per environment:** ISV Onboarding's chat runs `gemini-4-argon` in DEV, `gemini-2.5-pro` in UAT
   and PROD, and the gateway default locally (`gemini-2.5-flash`).
5. **Local `CHAT_AI_MAX_TOKENS=320`** in ISV Onboarding's `.env` is far below the cloud value (4096); the gateway
   raises every budget to at least 4096 + 8192 anyway (4.2).
