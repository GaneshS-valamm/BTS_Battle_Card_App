"""Settings, read once from the environment (and backend/.env when present)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None or v.strip() == "":
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _database_url() -> str:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        return f"sqlite:///{(BACKEND_DIR / 'abhay.db').as_posix()}"
    # Render and Heroku hand out postgres:// URLs; SQLAlchemy needs the driver named.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _origins() -> list[str]:
    raw = (os.getenv("CORS_ORIGINS") or "").split(",") + [os.getenv("FRONTEND_URL") or ""]
    out: list[str] = []
    for o in raw:
        o = o.strip().rstrip("/")  # browsers send the origin without a trailing slash
        if o and o not in out:
            out.append(o)
    return out


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=_database_url)
    # Gemini on Vertex AI, authenticated with a Vertex AI API key. Application Default Credentials are never used.
    ai_provider: str = field(default_factory=lambda: (os.getenv("AI_PROVIDER") or "gemini").strip().lower())
    # Server-side secret: never returned by any endpoint; repr=False keeps it out of logs and tracebacks.
    vertex_api_key: str = field(default_factory=lambda: (os.getenv("AI_VERTEX_API_KEY") or "").strip(), repr=False)
    # Optional: route calls to this project and region. Empty project = the key's own project (express mode).
    vertex_project: str = field(default_factory=lambda: (os.getenv("AI_VERTEX_PROJECT") or "").strip())
    vertex_location: str = field(default_factory=lambda: (os.getenv("AI_VERTEX_LOCATION") or "global").strip())
    llm_model: str = field(default_factory=lambda: (os.getenv("AI_DEFAULT_MODEL") or os.getenv("LLM_MODEL") or "gemini-2.5-flash").strip())
    temperature: float = field(default_factory=lambda: float(os.getenv("AI_TEMPERATURE") or 0.4))
    web_search: bool = field(default_factory=lambda: _bool("LLM_WEB_SEARCH", True))
    ai_rate_limit_per_hour: int = field(default_factory=lambda: _int("AI_RATE_LIMIT_PER_HOUR", 40))
    app_access_key: str = field(default_factory=lambda: (os.getenv("APP_ACCESS_KEY") or "").strip())
    # Origins allowed to call the API: CORS_ORIGINS (comma-separated) plus FRONTEND_URL.
    cors_origins: list[str] = field(default_factory=lambda: _origins())
    frontend_dist: Path = field(
        default_factory=lambda: Path(os.getenv("FRONTEND_DIST") or (BACKEND_DIR.parent / "frontend" / "dist"))
    )

    @property
    def llm_configured(self) -> bool:
        # AI is on only with an API key: no key means AI is off, never a fallback to ADC.
        return self.ai_provider == "gemini" and bool(self.vertex_api_key)

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
