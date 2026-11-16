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


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=_database_url)
    # Gemini on Vertex AI (as in the Valamm AI gateway): project + location, credentials from ADC.
    ai_provider: str = field(default_factory=lambda: (os.getenv("AI_PROVIDER") or "gemini").strip().lower())
    vertex_project: str = field(default_factory=lambda: (os.getenv("AI_VERTEX_PROJECT") or "").strip())
    vertex_location: str = field(default_factory=lambda: (os.getenv("AI_VERTEX_LOCATION") or "global").strip())
    # Vertex AI API key (express mode, "AQ." keys). When set it is used instead of project + ADC.
    vertex_api_key: str = field(default_factory=lambda: (os.getenv("AI_VERTEX_API_KEY") or "").strip())
    # Optional alternative: Gemini Developer API key (used only when no Vertex key or project is set)
    gemini_api_key: str = field(default_factory=lambda: (os.getenv("GEMINI_API_KEY") or "").strip())
    llm_model: str = field(default_factory=lambda: (os.getenv("AI_DEFAULT_MODEL") or os.getenv("LLM_MODEL") or "gemini-2.5-flash").strip())
    temperature: float = field(default_factory=lambda: float(os.getenv("AI_TEMPERATURE") or 0.4))
    web_search: bool = field(default_factory=lambda: _bool("LLM_WEB_SEARCH", True))
    ai_rate_limit_per_hour: int = field(default_factory=lambda: _int("AI_RATE_LIMIT_PER_HOUR", 40))
    app_access_key: str = field(default_factory=lambda: (os.getenv("APP_ACCESS_KEY") or "").strip())
    cors_origins: list[str] = field(
        default_factory=lambda: [o.strip() for o in (os.getenv("CORS_ORIGINS") or "").split(",") if o.strip()]
    )
    frontend_dist: Path = field(
        default_factory=lambda: Path(os.getenv("FRONTEND_DIST") or (BACKEND_DIR.parent / "frontend" / "dist"))
    )

    @property
    def llm_configured(self) -> bool:
        return self.ai_provider == "gemini" and bool(self.vertex_api_key or self.vertex_project or self.gemini_api_key)

    @property
    def llm_auth(self) -> str:
        """Which credentials the AI client uses: 'vertex-key', 'vertex-adc', 'gemini-key' or ''."""
        if self.vertex_api_key:
            return "vertex-key"
        if self.vertex_project:
            return "vertex-adc"
        return "gemini-key" if self.gemini_api_key else ""

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
