"""Validates and trims model output before it reaches a phone. Enforces the hard rules
that code can enforce: no "PDMaaS", no "certified", offer O12 (AWS credits) only for a
confirmed startup, unknown offer ids dropped, every field present with "Not found"."""
from __future__ import annotations

import re
from typing import Any

from .content_store import STARTUP_ONLY_OFFERS, offer_ids

NF = "Not found"
INDUSTRIES = {"healthcare", "manufacturing", "itites", "bfsi", "retail", "auto", "telecom", "pharma", "logistics", "energy", "education", "tech_product", "other"}
TYPES = {"enterprise", "mid", "startup", "isv", "global", "gov", "investor", "si", "other"}
CLOUDS = {"AWS", "Azure", "Google Cloud", "Multi-cloud", "On-premises", "Unknown"}

_PDM = re.compile(r"\bPDMaaS\b", re.I)
_CERT = re.compile(r"\b(fully compliant|certified)\b", re.I)
_CREDITS = re.compile(r"[^.;\n]*\b(AWS\s+)?(activate\s+)?credits?\b[^.;\n]*[.;]?", re.I)


def scrub(s: Any, *, allow_credits: bool, limit: int = 600) -> str:
    t = str(s if s is not None else "").strip()
    t = _PDM.sub("AWS partner-development and co-sell support", t)
    t = _CERT.sub("designed to align with", t)
    if not allow_credits:
        t = _CREDITS.sub("", t).strip()
    t = re.sub(r"\s{2,}", " ", t)
    return t[:limit]


def _s(v: Any, allow: bool, limit: int = 600, default: str = NF) -> str:
    out = scrub(v, allow_credits=allow, limit=limit)
    return out or default


def _list(v: Any, n: int) -> list:
    return v[:n] if isinstance(v, list) else []


def clean_check(j: dict) -> dict:
    conf = j.get("confidence") if j.get("confidence") in ("high", "medium", "low") else "low"
    return {
        "recognised": bool(j.get("recognised")),
        "what": scrub(j.get("what"), allow_credits=False, limit=280),
        "industry": j.get("industry") if j.get("industry") in INDUSTRIES else "other",
        "security_vendor": bool(j.get("security_vendor")),
        "type": j.get("type") if j.get("type") in TYPES else "",
        "confidence": conf,
        "hq": scrub(j.get("hq"), allow_credits=False, limit=80),
    }


def clean_identify(j: dict) -> dict:
    out = clean_check({**j, "recognised": j.get("found")})
    site = re.sub(r"^https?://", "", str(j.get("website") or "").strip().lower())
    site = re.sub(r"^www\.", "", site).split("/")[0]
    company = scrub(j.get("company"), allow_credits=True, limit=120)
    found = bool(j.get("found")) and bool(company)
    lines = [scrub(x, allow_credits=True, limit=80) for x in _list(j.get("lines"), 10) if str(x).strip()]
    return {
        **out,
        "found": found,
        "company": company if found else "",
        "website": site if re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", site or "") else "",
        "logo": scrub(j.get("logo"), allow_credits=True, limit=160),
        "lines": [x for x in lines if x and x.lower() != company.lower()],
    }


def clean_entities(j: dict) -> list[dict]:
    out = []
    for e in _list(j.get("list"), 10):
        if not isinstance(e, dict) or not str(e.get("name") or "").strip():
            continue
        out.append(
            {
                "name": scrub(e.get("name"), allow_credits=True, limit=80),
                "what": scrub(e.get("what"), allow_credits=False, limit=120),
                "industry": e.get("industry") if e.get("industry") in INDUSTRIES else "other",
            }
        )
    return out


def clean_report(j: dict, *, startup_confirmed: bool) -> dict:
    a = startup_confirmed  # credits may be mentioned only for a confirmed startup
    market = j.get("market") if isinstance(j.get("market"), dict) else {}
    infra = j.get("infra") if isinstance(j.get("infra"), dict) else {}
    countries = j.get("countries") if isinstance(j.get("countries"), dict) else {}

    def size(x: Any) -> dict:
        x = x if isinstance(x, dict) else {}
        return {"v": _s(x.get("v"), a, 80), "n": _s(x.get("n"), a, 200, "")}

    valid = offer_ids()
    fit, seen = [], set()
    for f in _list(j.get("fit"), 8):
        if not isinstance(f, dict):
            continue
        oid = str(f.get("id") or "").strip().upper()
        if oid not in valid or oid in seen:
            continue  # unknown or duplicate offer id
        if oid in STARTUP_ONLY_OFFERS and not startup_confirmed:
            continue  # AWS startup programs: confirmed startups only
        seen.add(oid)
        fit.append({"id": oid, "why": _s(f.get("why"), a, 300, "")})

    cloud = str(infra.get("cloud") or "Unknown").strip()
    evidence = [_s(x, a, 200) for x in _list(infra.get("evidence"), 5) if str(x).strip()]
    if cloud not in CLOUDS or (cloud not in ("Unknown",) and not evidence):
        cloud = "Unknown"  # name a cloud only with public evidence

    return {
        "recognised": bool(j.get("recognised")),
        "confidence": j.get("confidence") if j.get("confidence") in ("high", "medium", "low") else "low",
        "about": _s(j.get("about"), a, 900),
        "facts": [
            {"k": _s(f.get("k"), a, 40), "v": _s(f.get("v"), a, 200)}
            for f in _list(j.get("facts"), 8)
            if isinstance(f, dict)
        ],
        "products": [
            {"name": _s(p.get("name"), a, 80), "line": _s(p.get("line"), a, 240, "")}
            for p in _list(j.get("products"), 8)
            if isinstance(p, dict)
        ],
        "countries": {
            "list": [_s(c, a, 60) for c in _list(countries.get("list"), 30) if str(c).strip()],
            "india": _s(countries.get("india"), a, 300),
        },
        "channels": [
            {"type": _s(c.get("type"), a, 40), "detail": _s(c.get("detail"), a, 240, "")}
            for c in _list(j.get("channels"), 6)
            if isinstance(c, dict)
        ],
        "infra": {
            "cloud": cloud,
            "detail": _s(infra.get("detail"), a, 400),
            "evidence": evidence,
            "stack": [_s(x, a, 60) for x in _list(infra.get("stack"), 12) if str(x).strip()],
            "ask": _s(infra.get("ask"), a, 300, "Where do your main workloads run today, and what would you change?"),
        },
        "market": {
            "tam": size(market.get("tam")),
            "sam": size(market.get("sam")),
            "som": size(market.get("som")),
            "year": _s(market.get("year"), a, 20),
            "basis": _s(market.get("basis"), a, 400),
        },
        "mandates": [
            {"name": _s(m.get("name"), a, 100), "why": _s(m.get("why"), a, 300, "")}
            for m in _list(j.get("mandates"), 6)
            if isinstance(m, dict)
        ],
        "signals": [_s(x, a, 300) for x in _list(j.get("signals"), 6) if str(x).strip()],
        "fit": fit,
        "openers": [_s(x, a, 300) for x in _list(j.get("openers"), 4) if str(x).strip()],
        "caveats": _s(j.get("caveats"), a, 500, ""),
    }
