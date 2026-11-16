"""Database tables.

company_checks   cached AI "what does this company do" answers, one row per company key
market_reports   cached Market Insight Reports, one row per company key (Refresh overwrites)
conversation_logs  what the seller saved from card page 3 (a copy of the Compass summary)
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CompanyCheck(Base):
    __tablename__ = "company_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(200), default="")
    result: Mapped[dict] = mapped_column(JSON)
    live: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MarketReport(Base):
    __tablename__ = "market_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    company: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(200), default="")
    startup_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    report: Mapped[dict] = mapped_column(JSON)
    live: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ConversationLog(Base):
    __tablename__ = "conversation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company: Mapped[str] = mapped_column(String(200), default="")
    person: Mapped[str] = mapped_column(String(200), default="")
    designation: Mapped[str] = mapped_column(String(200), default="")
    card_id: Mapped[str] = mapped_column(String(8))
    card_name: Mapped[str] = mapped_column(String(200), default="")
    heard: Mapped[list] = mapped_column(JSON, default=list)
    asked: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
