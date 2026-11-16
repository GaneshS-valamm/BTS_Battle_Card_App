"""Loads the battle-card content (cards, KB, offers, question bank, quick reference)
and the entity directory from app/content/*.json. Edit those files to change copy."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent / "content"


@lru_cache(maxsize=1)
def content() -> dict:
    with open(CONTENT_DIR / "content.json", encoding="utf-8") as f:
        data = json.load(f)
    with open(CONTENT_DIR / "entities.json", encoding="utf-8") as f:
        data["ents"] = json.load(f)
    return data


def offer_catalog() -> dict[str, dict]:
    return content().get("offers", {}).get("catalog", {})


def offer_ids() -> set[str]:
    return set(offer_catalog().keys())


# Offer O12 is the AWS startup programs offer (credits). Startups only.
STARTUP_ONLY_OFFERS = {"O12"}
