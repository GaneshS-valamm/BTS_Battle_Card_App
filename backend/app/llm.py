"""Gemini on Vertex AI (official `google-genai` SDK), following the Valamm AI gateway's rules
(bts/AI_INTEGRATION.md): ADC credentials, thinking-token headroom, retries, no long dashes.

Every AI feature goes through `ask()`. When AI_VERTEX_PROJECT is not set, `ask()` raises
LLMNotConfigured and the API answers 503 with {"error": "llm_not_configured"}; the app
then falls back to its local logic and says so on screen.

Live research uses Gemini's Google Search grounding tool; sources come from the
grounding metadata. Photo reading sends the image inline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from dataclasses import dataclass, field
from typing import Any

import httpx
from google import genai
from google.genai import errors, types

from .config import settings

log = logging.getLogger("abhay.llm")


class LLMNotConfigured(RuntimeError):
    pass


class LLMError(RuntimeError):
    pass


@dataclass
class LLMResult:
    text: str
    sources: list[dict] = field(default_factory=list)
    searched: bool = False


_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if not settings.llm_configured:
        raise LLMNotConfigured("AI_VERTEX_PROJECT is not set")
    if _client is None:
        if settings.vertex_project:
            # Credentials come from Application Default Credentials (no API key), as in the Valamm AI gateway.
            _client = genai.Client(vertexai=True, project=settings.vertex_project, location=settings.vertex_location)
        else:
            _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


_REDIRECT = "vertexaisearch.cloud.google.com/grounding-api-redirect"


async def _resolve(url: str) -> str:
    """Google grounding links are redirects; resolve them to the publisher URL (as the gateway does)."""
    if _REDIRECT not in url:
        return url
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as h:
            r = await h.get(url)
            loc = r.headers.get("location", "")
            return loc if loc.startswith("http") else url
    except Exception:
        return url


async def _sources(resp: Any) -> list[dict]:
    raw: list[tuple[str, str]] = []
    for cand in getattr(resp, "candidates", None) or []:
        gm = getattr(cand, "grounding_metadata", None)
        for ch in (getattr(gm, "grounding_chunks", None) or []) if gm else []:
            web = getattr(ch, "web", None)
            uri = getattr(web, "uri", "") or ""
            if uri.startswith("http"):
                raw.append((uri, getattr(web, "title", "") or getattr(web, "domain", "") or ""))
    raw = raw[:12]
    urls = await asyncio.gather(*[_resolve(u) for u, _ in raw])
    out, seen = [], set()
    for (u, title), real in zip(raw, urls):
        if real in seen:
            continue
        seen.add(real)
        out.append({"url": real, "title": title or real})
    return out


_TRANSIENT = ("429", "resource exhausted", "quota", "500", "502", "503", "504", "unavailable", "internal",
              "deadline", "overloaded", "connection", "timeout")


def _plain_dashes(t: str) -> str:
    # Valamm writes no em or en dashes
    return t.replace(" — ", ", ").replace("—", ", ").replace("–", "-")


async def _generate(c: genai.Client, contents: list[Any], config: types.GenerateContentConfig) -> Any:
    last: Exception | None = None
    for attempt in range(4):
        try:
            return await c.aio.models.generate_content(model=settings.llm_model, contents=contents, config=config)
        except errors.ClientError as e:
            code = getattr(e, "code", 0) or 0
            if code == 429 and attempt < 3:
                last = e
            else:
                raise
        except Exception as e:  # server errors, network, timeouts
            if not any(k in str(e).lower() for k in _TRANSIENT) or attempt == 3:
                raise
            last = e
        await asyncio.sleep(min(1.5 * 2 ** attempt, 8) + random.random() * 0.5)
    raise last or RuntimeError("no answer")


def _text(resp: Any) -> str:
    try:
        return (resp.text or "").strip()
    except Exception:
        return ""


def _finish(resp: Any) -> str:
    try:
        return str(resp.candidates[0].finish_reason or "")
    except Exception:
        return ""


async def ask(
    prompt: str,
    *,
    web_search: bool = False,
    images: list[tuple[bytes, str]] | None = None,
    max_tokens: int = 4096,
) -> LLMResult:
    """One question, one answer. Optional Google Search grounding and images."""
    c = client()
    contents: list[Any] = [types.Part.from_bytes(data=data, mime_type=mime) for data, mime in images or []]
    contents.append(prompt)
    # Gemini 2.5 counts thinking tokens against the output budget: add headroom (gateway rule).
    budget = min(max(max_tokens, 4096) + 8192, 65535)

    def cfg(b: int) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            max_output_tokens=b,
            temperature=settings.temperature,
            # JSON mode cannot be combined with the search tool; prompts ask for one JSON object instead.
            tools=[types.Tool(google_search=types.GoogleSearch())] if web_search else None,
        )

    try:
        resp = await _generate(c, contents, cfg(budget))
        if not _text(resp) and "MAX_TOKENS" in _finish(resp):
            resp = await _generate(c, contents, cfg(min(budget * 3, 65535)))
    except errors.ClientError as e:
        code = getattr(e, "code", 0)
        log.warning("Gemini client error %s: %s", code, e)
        if code in (401, 403):
            raise LLMError("Vertex AI refused the call. Check the Google login (gcloud auth application-default login) and the Vertex AI User role.") from e
        if code == 429:
            raise LLMError("The AI service is busy or over quota. Try again in a minute.") from e
        if code == 404:
            raise LLMError(f"The model '{settings.llm_model}' is not available in {settings.vertex_location}.") from e
        raise LLMError(f"The AI service rejected the request ({code}).") from e
    except errors.APIError as e:
        log.warning("Gemini API error: %s", e)
        raise LLMError("The AI provider did not answer. Try again in a minute.") from e
    except Exception as e:
        log.warning("Gemini call failed: %r", e)
        msg = str(e)
        if "credentials" in msg.lower() or "default credentials" in msg.lower():
            raise LLMError("No Google credentials on the server. Run: gcloud auth application-default login") from e
        raise LLMError("Could not reach the AI service.") from e

    text = _text(resp)
    if not text:
        reason = _finish(resp)
        raise LLMError("The AI returned no answer" + (f" ({reason})." if reason else "."))
    return LLMResult(text=_plain_dashes(text), sources=await _sources(resp) if web_search else [], searched=web_search)


def parse_json(text: str) -> dict:
    """Pull the JSON object out of a model reply (tolerates prose or code fences around it)."""
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        raise LLMError("The AI reply did not contain JSON.")
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise LLMError("The AI reply was not valid JSON.") from e
    if not isinstance(data, dict):
        raise LLMError("The AI reply was not a JSON object.")
    return data
