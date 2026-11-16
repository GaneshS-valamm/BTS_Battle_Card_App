"""VHumans API (FastAPI). Serves the content, the AI features and, in production, the built
React app from frontend/dist so the whole product runs as one Render web service."""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import cleaning, llm, prompts
from .config import settings
from .content_store import content
from .database import get_db, init_db
from .models import CompanyCheck, ConversationLog, MarketReport

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("vhumans")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    log.info("Database ready (%s).", "sqlite" if settings.is_sqlite else "postgresql")
    if settings.llm_configured:
        log.info("AI: %s via Vertex AI API key (project %s, location %s).", settings.llm_model,
                 settings.vertex_project or "from key", settings.vertex_location if settings.vertex_project else "global")
    else:
        log.warning("AI is OFF: AI_VERTEX_API_KEY is not set. AI endpoints answer 503 llm_not_configured.")
    yield


app = FastAPI(title="VHumans API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["content-type", "x-vhumans-key"],
    )


# ---------- guards ----------
@app.middleware("http")
async def access_key_guard(request: Request, call_next):
    # CORS preflights (OPTIONS) never carry the key; let them through so the browser can send the real call.
    if (settings.app_access_key and request.method != "OPTIONS"
            and request.url.path.startswith("/api/") and request.url.path != "/api/health"):
        if request.headers.get("x-vhumans-key") != settings.app_access_key:
            return JSONResponse({"error": "unauthorised", "detail": "Missing or wrong access key."}, status_code=401)
    return await call_next(request)


_hits: dict[str, deque] = defaultdict(deque)


def ai_rate_limit(request: Request) -> None:
    """Simple in-memory per-IP cap on AI calls (protects the API budget)."""
    limit = settings.ai_rate_limit_per_hour
    if limit <= 0:
        return
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, detail="Too many AI requests from this device in the last hour. Try again later.")
    q.append(now)


def require_llm() -> None:
    if not settings.llm_configured:
        raise HTTPException(503, detail="llm_not_configured")


def company_key(name: str, domain: str = "") -> str:
    base = (domain or name or "").lower().strip()
    base = re.sub(r"^https?://", "", base)
    base = re.sub(r"^www\.", "", base).split("/")[0]
    return re.sub(r"[^a-z0-9.&]+", " ", base).strip()[:200]


@app.exception_handler(llm.LLMError)
async def llm_error_handler(_: Request, exc: llm.LLMError):
    return JSONResponse({"error": "llm_error", "detail": str(exc)}, status_code=502)


@app.exception_handler(llm.LLMNotConfigured)
async def llm_nc_handler(_: Request, exc: llm.LLMNotConfigured):
    return JSONResponse({"error": "llm_not_configured", "detail": str(exc)}, status_code=503)


# ---------- basics ----------
@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db_ok = True
    try:
        db.execute(text("select 1"))
    except Exception:  # pragma: no cover
        db_ok = False
    return {"ok": db_ok, "db": "sqlite" if settings.is_sqlite else "postgresql", "llm": settings.llm_configured}


@app.get("/api/config")
def config():
    return {
        "llm": settings.llm_configured,
        "webSearch": settings.llm_configured and settings.web_search,
        "model": settings.llm_model if settings.llm_configured else "",
        "accessKey": bool(settings.app_access_key),
    }


@app.get("/api/content")
def get_content():
    return content()


# ---------- company check ----------
class CheckIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    domain: str = Field(default="", max_length=200)
    desc: str = Field(default="", max_length=2000)


@app.post("/api/company-check")
async def company_check(body: CheckIn, request: Request, db: Session = Depends(get_db)):
    require_llm()
    key = company_key(body.name, body.domain)
    if not body.desc:
        cached = db.scalar(select(CompanyCheck).where(CompanyCheck.key == key))
        if cached:
            return {**cached.result, "live": cached.live, "cached": True}
    ai_rate_limit(request)
    live = settings.web_search
    res = await llm.ask(
        prompts.company_check_prompt(body.name, body.domain, body.desc, live),
        web_search=live,
        max_tokens=4000,
    )
    out = cleaning.clean_check(llm.parse_json(res.text))
    out["sources"] = res.sources[:5]
    if not body.desc:
        row = db.scalar(select(CompanyCheck).where(CompanyCheck.key == key)) or CompanyCheck(key=key)
        row.name, row.domain, row.result, row.live = body.name, body.domain, out, live
        row.created_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
    return {**out, "live": live, "cached": False}


# ---------- suggest more entities ----------
class EntitiesIn(BaseModel):
    q: str = Field(min_length=2, max_length=80)
    known: list[str] = Field(default_factory=list, max_length=60)


@app.post("/api/entities")
async def entities(body: EntitiesIn, request: Request):
    require_llm()
    ai_rate_limit(request)
    res = await llm.ask(prompts.entities_prompt(body.q, body.known), max_tokens=3000)
    known = {k.lower() for k in body.known}
    items = [e for e in cleaning.clean_entities(llm.parse_json(res.text)) if e["name"].lower() not in known]
    return {"list": items}


# ---------- Market Insight Report ----------
class ReportIn(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    domain: str = Field(default="", max_length=200)
    startupConfirmed: bool = False
    refresh: bool = False
    ctx: dict[str, str] = Field(default_factory=dict)


def _report_out(row: MarketReport, cached: bool) -> dict:
    return {
        "company": row.company,
        "report": row.report,
        "live": row.live,
        "model": row.model,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "cached": cached,
    }


def _cached_view(row: MarketReport, startup_confirmed: bool) -> dict:
    out = _report_out(row, cached=True)
    if row.startup_confirmed and not startup_confirmed:
        # built for a confirmed startup, but the seller no longer says so: drop the credits offer and lines
        rep = row.report or {}
        out["report"] = {**cleaning.clean_report(rep, startup_confirmed=False), "sources": rep.get("sources", [])}
    return out


@app.get("/api/report")
def get_report(company: str, domain: str = "", startupConfirmed: bool = False, db: Session = Depends(get_db)):
    """Cached report only. Never calls the model."""
    row = db.scalar(select(MarketReport).where(MarketReport.key == company_key(company, domain)))
    if not row:
        return {"found": False}
    return {"found": True, **_cached_view(row, startupConfirmed)}


@app.post("/api/report")
async def build_report(body: ReportIn, request: Request, db: Session = Depends(get_db)):
    key = company_key(body.company, body.domain)
    row = db.scalar(select(MarketReport).where(MarketReport.key == key))
    if row and not body.refresh:
        return _cached_view(row, body.startupConfirmed)
    require_llm()
    ai_rate_limit(request)
    live = settings.web_search
    ctx = {k: str(v)[:120] for k, v in body.ctx.items() if k in ("industry", "type", "person", "designation", "what") and v}
    res = await llm.ask(
        prompts.report_prompt(body.company, body.domain, ctx, body.startupConfirmed, live),
        web_search=live,
        max_tokens=8192,
    )
    rep = cleaning.clean_report(llm.parse_json(res.text), startup_confirmed=body.startupConfirmed)
    rep["sources"] = res.sources[:10]
    row = row or MarketReport(key=key)
    row.company, row.domain, row.startup_confirmed = body.company, body.domain, body.startupConfirmed
    row.report, row.live, row.model = rep, live, settings.llm_model
    row.created_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return _report_out(row, cached=False)


# ---------- photo reading ----------
@app.post("/api/ocr")
async def ocr(request: Request, image: UploadFile = File(...)):
    require_llm()
    ai_rate_limit(request)
    media = (image.content_type or "").lower()
    if media not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(415, detail="Send a JPEG, PNG, WebP or GIF image.")
    data = await image.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, detail="Image too large (5 MB max).")
    res = await llm.ask(prompts.OCR_PROMPT, images=[(data, media)], max_tokens=1000)
    lines = [ln.strip(" -•\t") for ln in res.text.splitlines()]
    lines = [ln for ln in lines if len(ln) >= 2 and ln.upper() != "NONE"][:14]
    return {"lines": lines}


@app.post("/api/identify-photo")
async def identify_photo(request: Request, image: UploadFile = File(...), db: Session = Depends(get_db)):
    """Reads the logo and text in a photo, then searches the web to confirm the company."""
    require_llm()
    ai_rate_limit(request)
    media = (image.content_type or "").lower()
    if media not in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"):
        raise HTTPException(415, detail="Send a JPEG, PNG, WebP or HEIC image.")
    data = await image.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, detail="Image too large (8 MB max).")
    live = settings.web_search
    res = await llm.ask(prompts.identify_photo_prompt(live), images=[(data, media)], web_search=live, max_tokens=2048)
    out = cleaning.clean_identify(llm.parse_json(res.text))
    out["sources"] = res.sources[:5]
    out["live"] = live
    if out["found"]:
        # cache as a company check, so opening the company next costs no extra AI call
        check = {k: out[k] for k in ("recognised", "what", "industry", "security_vendor", "type", "confidence", "hq")}
        check["sources"] = out["sources"]
        for key in {company_key(out["company"]), company_key(out["company"], out["website"])}:
            row = db.scalar(select(CompanyCheck).where(CompanyCheck.key == key)) or CompanyCheck(key=key)
            row.name, row.domain, row.result, row.live = out["company"], out["website"], check, live
            row.created_at = datetime.now(timezone.utc)
            db.add(row)
        db.commit()
    return out


# ---------- conversation logs ----------
class LogIn(BaseModel):
    company: str = Field(default="", max_length=200)
    person: str = Field(default="", max_length=200)
    designation: str = Field(default="", max_length=200)
    cardId: str = Field(min_length=1, max_length=8)
    cardName: str = Field(default="", max_length=200)
    heard: list[str] = Field(default_factory=list, max_length=20)
    asked: list[str] = Field(default_factory=list, max_length=60)
    notes: str = Field(default="", max_length=5000)
    summary: str = Field(default="", max_length=8000)


def _log_out(r: ConversationLog) -> dict:
    return {
        "id": r.id, "company": r.company, "person": r.person, "designation": r.designation,
        "cardId": r.card_id, "cardName": r.card_name, "heard": r.heard, "asked": r.asked,
        "notes": r.notes, "summary": r.summary, "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


@app.post("/api/logs")
def create_log(body: LogIn, db: Session = Depends(get_db)):
    r = ConversationLog(
        company=body.company, person=body.person, designation=body.designation, card_id=body.cardId,
        card_name=body.cardName, heard=body.heard, asked=body.asked, notes=body.notes, summary=body.summary,
    )
    db.add(r)
    db.commit()
    return _log_out(r)


@app.get("/api/logs")
def list_logs(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(select(ConversationLog).order_by(ConversationLog.id.desc()).limit(max(1, min(limit, 200)))).all()
    return {"items": [_log_out(r) for r in rows]}


@app.delete("/api/logs/{log_id}")
def delete_log(log_id: int, db: Session = Depends(get_db)):
    r = db.get(ConversationLog, log_id)
    if not r:
        raise HTTPException(404, detail="Not found")
    db.delete(r)
    db.commit()
    return {"ok": True}


# ---------- built frontend (production) ----------
_dist = settings.frontend_dist
if (_dist / "index.html").exists():
    if (_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        f = (_dist / path).resolve()
        if path and f.is_file() and _dist.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
