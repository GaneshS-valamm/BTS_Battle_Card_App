# Changelog

## 1.2.0 — 2026-11-16

- AI now runs on Gemini through Vertex AI (project and location, Application Default Credentials), following bts/AI_INTEGRATION.md: thinking-token headroom, retries on transient errors, no long dashes, grounding redirect links resolved to publisher URLs.
- Photo identification: `/api/identify-photo` reads the logo and text, confirms the company with Google Search, and caches it as a company check. Home shows the company, website, what they do and sources, with "Use" and "Market Insight Report" buttons. Falls back to on-device text reading.
- Market Insight Report available from every screen (header button, Home tile) with a company picker when none is in context.
- Database: PostgreSQL on Render.

## 1.1.0 — 2026-11-16

- AI provider switched from Claude to Google Gemini (`google-genai` SDK). Live research uses Google Search grounding; sources come from grounding metadata. Settings: `GEMINI_API_KEY`, `LLM_MODEL` (default `gemini-2.5-flash`), `LLM_WEB_SEARCH`.

## 1.0.0 — 2026-11-16

Rebuilt the single-file mockup (`Abhay_App.html`) as a React + FastAPI application.

- Content (43 cards, knowledge base, 17 offers and card map, question bank, quick reference) moved from the mockup's embedded `DATA` into `backend/app/content/content.json`, served by `/api/content`.
- Engine (`classify`, `scoreCards`, `roleFromText`, `inferProduct`), conversation flow and search ported to TypeScript unchanged.
- Added the parts the mockup build lacked, per the handoff: entity picker (`entities.json`, about 190 rows) with "Suggest more companies"; photo buttons on Home; Market Insight Report with a token confirmation, a server-side cache and Refresh.
- The AI API key stays on the server. Company check, entity suggestions, report and photo reading go through FastAPI (replaces the Cloudflare Worker and `window.claude`).
- Rule enforcement on the server: offer O12 and credit lines dropped unless a startup is confirmed; unknown offer ids dropped; "PDMaaS" and "certified" scrubbed; cloud named only with evidence.
- New: "Save to Abhay log" on card page 3 (stores the Compass summary in the database). Pasting into Compass the same day is still required.
- Optional shared access key (`APP_ACCESS_KEY`) and a per-IP hourly cap on AI calls.
