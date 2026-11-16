# Abhay — VirtualizingHumans.AI battle card

Internal sales and onboarding companion for Valamm.AI and VirtualizingHumans.AI. A seller types a company (or photographs a name board), adds the person, and gets a three-page battle card, with an optional AI-written Market Insight Report.

Built from `Abhay_App.html` (the mockup and reference implementation) and `VirtualizingHumans_Abhay_Battle_Card.pptx` (the master content), following the developer handoff document.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 4 |
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLAlchemy 2: SQLite locally, PostgreSQL in production (`DATABASE_URL`) |
| AI | Gemini on Vertex AI via the official `google-genai` SDK (Google Search grounding for live research, image input for logos) |
| Hosting | Render (one web service: FastAPI serves the API and the built frontend) |

## Layout

```
backend/
  app/
    main.py           API routes; serves frontend/dist in production
    config.py         environment settings
    database.py       SQLAlchemy engine/session
    models.py         company_checks, market_reports, conversation_logs
    llm.py            Gemini on Vertex AI: ADC credentials, retries, thinking headroom, grounding sources
    prompts.py        REP_RULES (the hard rules), REP_SHAPE, all prompts
    cleaning.py       enforces rules on model output (O12/credits gating, no "PDMaaS", no "certified", "Not found")
    content/
      content.json    43 cards, knowledge base, 17 offers + card map, question bank, quick reference
      entities.json   company directory for the "HDFC" style picker  [group, name, industry, what]
  tests/test_api.py   API tests with the model mocked (no tokens)
frontend/
  src/lib/engine.ts   classify, scoreCards, roleFromText, inferProduct (ported 1:1 from the mockup)
  src/lib/flow.ts     buildFlow: the questions on each card page, guards
  src/lib/search.ts   search index, entity matches
  src/store.tsx       app state and actions (findCompany, pickEntity, serve, report flow)
  src/views/          Start, Company, Check, Manual, CardView, ReportView, Lists (All, Ref, KB)
  src/__tests__/      engine + "all 43 cards" QA checks
render.yaml           Render blueprint
```

Routes (hash): `#start`, `#company`, `#check`, `#manual`, `#card`, `#all`, `#ref`, `#kb`, `#report`.

## Run locally

Backend (terminal 1):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env            # optional; add keys when you have them
uvicorn app.main:app --reload --port 8000
```

Frontend (terminal 2):

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to :8000)
```

Or build once and let FastAPI serve everything at http://localhost:8000: `cd frontend && npm run build`.

## Configuration (`backend/.env`, never committed)

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB      # Render PostgreSQL (external URL locally, internal URL on Render)
AI_VERTEX_API_KEY=AQ....                              # Vertex AI API key; used first when set
AI_PROVIDER=gemini
AI_DEFAULT_MODEL=gemini-2.5-flash
AI_VERTEX_PROJECT=project-8ce5ae3e-81f4-4585-b74     # used with ADC only when no API key is set
AI_VERTEX_LOCATION=asia-south1
AI_TEMPERATURE=0.4
LLM_WEB_SEARCH=true                                   # Google Search grounding
```

AI credentials, in order: `AI_VERTEX_API_KEY` → `genai.Client(vertexai=True, api_key=...)` (no gcloud login, works on Render as a plain env var; the key's account needs the Vertex AI User role). Otherwise, as in `bts/AI_INTEGRATION.md`: `genai.Client(vertexai=True, project, location)` with Application Default Credentials. Locally run `gcloud auth application-default login` once with an account that has Vertex AI User on the project. If Google reports quota or "API not enabled": `gcloud auth application-default set-quota-project project-8ce5ae3e-81f4-4585-b74`.

What uses the model: the company check for unknown companies, "Suggest more companies", **photo identification** (Gemini reads the logo and text, then confirms the company with Google Search; the result is cached as a company check), and the Market Insight Report (only after the token confirmation). Without AI the app still works and says so.

The Market Insight Report is reachable from every screen (header button on inner screens, a tile on Home). Without a company in context it asks which company first.

### Using it on a phone (same Wi-Fi)

Run the frontend with `npm run dev -- --host 0.0.0.0` and open `http://<PC Wi-Fi IP>:5173` on the phone. "Take a photo" opens the phone camera (`capture="environment"`). Allow Node.js through the Windows firewall if asked.

### Vertex AI on Render

Simplest: set `AI_VERTEX_API_KEY` in the Render dashboard (it is `sync: false` in `render.yaml`). Without a key, Render is not Google Cloud, so there is no attached service account. Options: (1) a Workload Identity Federation credential file for Render, or (2) a service-account key file uploaded as a Render Secret File with `GOOGLE_APPLICATION_CREDENTIALS` pointing at it. The bts docs say the org policy forbids downloaded keys, so agree option 1 (or an exception) with whoever owns the Google project. Alternatively host the app on Cloud Run next to the Valamm AI gateway.

## Tests

```bash
cd backend && pytest -q          # API, credit gating, report cleaning and caching (model mocked)
cd frontend && npm test           # engine, search, and QA checks on all 43 cards
```

## Deploy on Render

1. Push this folder to a GitHub repository.
2. In Render: New → Blueprint → pick the repo (uses `render.yaml`).
3. Set `DATABASE_URL` (the database's internal URL) and Google credentials (see above) in the service's Environment tab.
4. Optional: set `APP_ACCESS_KEY` so every device must enter a shared team key once.

## Hard rules (handoff §3) and where code enforces them

- AWS credits: startups only. `scoreCards` drops cards 16/17 for non-startups; `applyGuess` never auto-sets "startup"; the server drops offer O12 and credit lines unless the seller confirmed a startup (`cleaning.clean_report`).
- "PDMaaS", "certified", prices, named customers, healthcare admin-only, partner wording: in `prompts.REP_RULES`; "PDMaaS" and "certified" also scrubbed in `cleaning.scrub`.
- Report honesty: unknown fields show "Not found"; a cloud is named only with evidence; market sizes are labelled estimates; a banner says live search vs general knowledge.

To change a rule, change it in the handoff table, `backend/app/prompts.py` (REP_RULES) and, if code enforces it, `cleaning.py` / `engine.ts`.

## Editing content

Copy lives in `backend/app/content/content.json` (same shape as the mockup's `DATA`) and `entities.json`. Edit, restart the server; no frontend rebuild needed. Keep stats and news with their source and date.
