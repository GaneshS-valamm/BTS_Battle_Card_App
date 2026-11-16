# Connecting another application to the existing Valamm AI infrastructure

The integration already exists: one AI gateway (`services/ai`) that talks to Gemini on Vertex AI with Application
Default Credentials. Another application reuses it by **calling the gateway over HTTP**, exactly as ISV Onboarding does.
Do not add a Google SDK, an API key, or a second integration to the new application.

Reference implementations in this repository:
- `services/isv-onboarding/api/app/chat/gateway.py` (the original caller)
- `services/marketplace-discovery/api/app/div_ai.py` (reuses ISV Onboarding's settings file)
- `packages/core/valamm_core/ai_client.py` (shared client)

## A. Local development

### 1. Google login (once per machine)
```
gcloud auth application-default login
```
The account needs Vertex AI User on `project-8ce5ae3e-81f4-4585-b74`. Details: `SECRETS_REQUIRED.md`.

### 2. Start the gateway
`services/ai/api/.env` must contain (it already does in this repository):
```
AI_PROVIDER=gemini
AI_DEFAULT_MODEL=gemini-2.5-flash
AI_VERTEX_PROJECT=project-8ce5ae3e-81f4-4585-b74
AI_VERTEX_LOCATION=asia-south1
```
From `valamm/`:
```
cd services/ai/api
../../../.venv/Scripts/python.exe -m uvicorn app.main:app --port 8005      # Windows
../../../.venv/bin/python -m uvicorn app.main:app --port 8005              # macOS / Linux
```
(`python -m app.main` also works; it starts with auto-reload when `AI_ENVIRONMENT=local`.)

### 3. Check it
```
curl http://localhost:8005/healthz        # {"status":"ok","provider":"gemini"}
curl http://localhost:8005/ai/info        # {"provider":"gemini","model":"gemini-2.5-flash","environment":"local"}
curl -X POST http://localhost:8005/ai/generate -H "Content-Type: application/json" \
     -d '{"prompt":"Say hello in five words.","max_tokens":256}'
```
`AUTH_MODE` is `off` locally, so no header is needed.

### 4. Configure the new application
Give it the same settings ISV Onboarding uses (`bts/.env.example`, section 2):
```
AI_GATEWAY_URL=http://localhost:8005
CHAT_AI_MODEL=            # blank = gateway default
CHAT_AI_ENABLED=true
CHAT_AI_TIMEOUT=30.0
CHAT_AI_TEMPERATURE=0.35
```
Inside this monorepo you can instead read ISV Onboarding's own `.env`, as `marketplace-discovery` does:
```python
ONBOARDING_ENV = Path(__file__).resolve().parents[3] / "isv-onboarding" / "api" / ".env"
class OnboardingAISettings(BaseSettings):
    ai_gateway_url: str = "http://localhost:8005"
    chat_ai_model: str = ""
    chat_ai_enabled: bool = True
    chat_ai_timeout: float = 30.0
    chat_ai_temperature: float = 0.35
    model_config = {"env_file": str(ONBOARDING_ENV), "extra": "ignore"}
```

### 5. Call the gateway

**Python (same pattern as ISV Onboarding: never raises, returns None on any failure)**
```python
import httpx

async def generate(prompt: str, system: str, *, max_tokens: int = 4096) -> str | None:
    if not (cfg.chat_ai_enabled and cfg.ai_gateway_url):
        return None
    payload = {"prompt": prompt, "system": system, "max_tokens": max_tokens,
               "temperature": cfg.chat_ai_temperature}
    if cfg.chat_ai_model:
        payload["model"] = cfg.chat_ai_model
    try:
        async with httpx.AsyncClient(timeout=cfg.chat_ai_timeout) as client:
            r = await client.post(f"{cfg.ai_gateway_url.rstrip('/')}/ai/generate", json=payload)
            r.raise_for_status()
            return (r.json().get("text") or "").strip() or None
    except Exception:
        return None   # fall back to non-AI behaviour
```

**Python, shared client (inside the monorepo)**
```python
from valamm_core.ai_client import ai          # reads AI_GATEWAY_URL from the environment
res = await ai.generate(prompt="…", system="…", max_tokens=4096, temperature=0.35)
text = res["text"]                            # raises on HTTP errors; wrap it if you need a fallback
```

**TypeScript (server side only, never from the browser)**
```ts
const r = await fetch(`${process.env.AI_GATEWAY_URL}/ai/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, system, max_tokens: 4096, temperature: 0.35 }),
});
const { text } = await r.json();
```
The browser must not call the gateway: in the cloud the call needs the internal token, which must stay on the server.

Request and response fields: `AI_INTEGRATION.md`, section 3.

## B. Cloud (Google Cloud Run, Terraform)

The new application must run as a Valamm service in the same project so it gets the same gateway URL and token.

1. **Image:** a Python API builds with `infra/docker/api.Dockerfile` and `SERVICE=<folder name>`; add it to
   `infra/terraform/<env>/cloud_build/terraform.tfvars` the way `ai-gateway` is listed.
2. **Service:** add it to `infra/terraform/<env>/cloud_run_services/terraform.tfvars` under `services`. As a non-web
   service it automatically receives:
   - `common_env`: `AI_GATEWAY_URL = "service://ai-gateway"` (the gateway's Cloud Run URL), `ENVIRONMENT=production`,
     `API_PORT=8080`;
   - `common_secrets`: `INTERNAL_TOKEN` from Secret Manager;
   - `signin_env` (when the environment has a domain): `AUTH_MODE=identity_platform`, `INTERNAL_URLS=internal-urls://`.
   Use the environment's runtime service account (`valamm-app-runtime` in DEV, `valamm-uat-run` in UAT,
   `valamm-prod-run` in PROD), which can read the token secret.
3. **Send the token:** call `valamm_core.auth.install(app, ...)` in the FastAPI app (every Valamm API does). It patches
   `httpx` so requests to any URL in `INTERNAL_URLS`, the gateway included, carry `X-Valamm-Internal`. Without
   `valamm_core`, add the header yourself from the `INTERNAL_TOKEN` environment variable, only on requests to the
   gateway.
4. **Model settings:** set the caller's `CHAT_AI_*` values in the service's `env` block like `onboarding-api`
   (DEV: `CHAT_AI_MODEL=gemini-4-argon`, `CHAT_AI_TIMEOUT=90.0`; UAT and PROD: `gemini-2.5-pro`, `60.0`), or leave
   `CHAT_AI_MODEL` empty to use the gateway default.
5. **Deploy:** `infra/terraform/deploy.sh` (see `infra/terraform/README.md`).

Nothing changes on the gateway: no new key, no new Google setup, no new service account role.

## C. Checklist

- [ ] Local: `gcloud auth application-default login` done with an account that has Vertex AI User
- [ ] Gateway running and `/ai/info` shows `"provider": "gemini"`
- [ ] The app has `AI_GATEWAY_URL` (local `http://localhost:8005`, cloud `service://ai-gateway`)
- [ ] The app calls `POST /ai/generate` from the server, with `prompt` or `messages`
- [ ] Cloud: the app is a Cloud Run service in the same Terraform map, with `INTERNAL_TOKEN` and `INTERNAL_URLS`
- [ ] The app has a fallback when the gateway fails (ISV Onboarding stores raw text and carries on)

## D. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Connection refused on 8005 | Gateway not running | Start it (A.2) |
| `/ai/info` shows `"provider": "mock"` | `AI_PROVIDER` not set | Set `AI_PROVIDER=gemini` in `services/ai/api/.env` and restart |
| 502 "The AI provider did not answer" | Google login missing or expired, no Vertex AI User role, API not enabled, or the model is not offered in `AI_VERTEX_LOCATION` | Run `gcloud auth application-default login`, check the role and `aiplatform.googleapis.com`, check the model and location (cloud uses `global`); the gateway log line shows the error |
| 403 "Only Valamm services may call this API." | Cloud call without the right `X-Valamm-Internal` | Make sure the app has `INTERNAL_TOKEN` and the gateway URL is in `INTERNAL_URLS`, and calls from the server |
| 422 "Provide 'prompt' or 'messages'" | Empty request | Send `prompt` or `messages` |
| 501 on `/ai/embed` | Gemini provider has no embeddings | Not available with `AI_PROVIDER=gemini` |
| Empty or cut-off `text` | Thinking tokens used the budget | The gateway already adds headroom and retries once; raise `max_tokens` for long JSON outputs |
| Quota or "API not enabled" errors locally | ADC quota project is a different project | `gcloud auth application-default set-quota-project project-8ce5ae3e-81f4-4585-b74` |
