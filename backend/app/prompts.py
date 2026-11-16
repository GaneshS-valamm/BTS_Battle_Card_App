"""Prompts for every model call. REP_RULES carries the standing rules from the handoff
(section 3). If a rule changes, change it here and in the rules table of the handoff."""
from __future__ import annotations

import json

from .content_store import offer_catalog

INDUSTRIES = "healthcare|manufacturing|itites|bfsi|retail|auto|telecom|pharma|logistics|energy|education|tech_product|other"
TYPES = "enterprise|mid|startup|isv|global|gov|investor|si|other"

REP_RULES = """Rules you must follow in every line you write:
- This is for internal use by sellers at Valamm.AI and its initiative VirtualizingHumans.AI. Never address the customer.
- Never write the word "PDMaaS". If you refer to that service, say "we act as your AWS partner-development and co-sell team".
- Never quote a price, fee or rate for any Valamm.AI or VirtualizingHumans.AI service.
- AWS credits are for startups only. Mention credits only when the company is a confirmed startup, and then only as "up to <amount>, subject to AWS eligibility, review and approval". Never promise credits.
- For compliance, say "designed to align with" (for example DPDP, PCI DSS, ISO 27001, SOC 2, RBI, SEBI, CERT-In, ABDM). Never say "certified" or "fully compliant".
- Illustrations are "for example" scenarios, never named customer cases.
- In healthcare, AI agents do administrative work only; clinicians make every clinical decision.
- On partner status, say only that VirtualizingHumans.AI is in partnership with an AWS Advanced Tier Partner. Add nothing else about tiers.
- Honesty: if you cannot find or do not know something, write exactly "Not found". Never invent a figure, customer, partner, product or source.
- Name a cloud provider only when there is public evidence; otherwise set cloud to "Unknown" and suggest a question to ask.
- Market sizes are estimates: give ranges, a year and a stated basis.
- Plain, warm English. Gloss any jargon."""

REP_SHAPE = {
    "recognised": "true|false",
    "confidence": "high|medium|low",
    "about": "two or three plain sentences on what the company does",
    "facts": [{"k": "Founded / HQ / Employees / Funding or listing / Leadership", "v": "value or Not found"}],
    "products": [{"name": "product or service", "line": "one line on what it does"}],
    "countries": {"list": ["countries or regions where they operate"], "india": "their India presence in one line, or Not found"},
    "channels": [{"type": "direct|partners|marketplace|resellers|online|other", "detail": "one line"}],
    "infra": {
        "cloud": "AWS|Azure|Google Cloud|Multi-cloud|On-premises|Unknown",
        "detail": "one line on their IT and cloud footprint",
        "evidence": ["public evidence for the cloud claim, empty when none"],
        "stack": ["notable technologies, empty when unknown"],
        "ask": "one question the seller can ask to confirm the infrastructure",
    },
    "market": {
        "tam": {"v": "range with currency", "n": "what it covers"},
        "sam": {"v": "range", "n": "what it covers"},
        "som": {"v": "range", "n": "what it covers"},
        "year": "year of the estimate",
        "basis": "how the estimate was formed",
    },
    "mandates": [{"name": "Indian government mandate or regulation (for example DPDP Act)", "why": "how it touches them or how we help"}],
    "signals": ["recent public news or signals, each with month and year"],
    "fit": [{"id": "offer id from the catalog", "why": "why this offer fits them"}],
    "openers": ["three conversation openers the seller can say"],
    "caveats": "what the seller should verify before relying on this",
}


def offers_brief() -> str:
    lines = []
    for oid, o in offer_catalog().items():
        lines.append(f"{oid}: {o.get('name')} ({o.get('brand')}): {o.get('what')}")
    return "\n".join(lines)


def company_check_prompt(name: str, domain: str, desc: str, live: bool) -> str:
    where = (
        "Use Google Search (a few searches at most) to find what the company does."
        if live
        else "You cannot browse the live web here. If you do not recognise the company, set recognised to false and infer only from the name, the website and the description, with confidence low."
    )
    return (
        "A seller is about to speak to someone from this company: "
        + name
        + (f" (website: {domain})" if domain else "")
        + ". "
        + (f'The company describes itself like this: "{desc[:1200]}". ' if desc else "")
        + where
        + " Reply with one JSON object and nothing else: "
        + '{"recognised":true|false,"what":"one plain sentence on what they do",'
        + f'"industry":"{INDUSTRIES}","security_vendor":true|false,"type":"{TYPES}",'
        + '"confidence":"high|medium|low","hq":"city, country or empty"}. '
        + "Use tech_product for a software, AI or security product company, and isv for its type. "
        + "Use startup only when public information clearly says it is an early-stage startup."
    )


def entities_prompt(q: str, known: list[str]) -> str:
    return (
        f'List up to 10 real, well-known companies or organisations, mostly in India, whose name contains or starts with "{q}". '
        + (f"Leave out these, already listed: {', '.join(known[:40])}. " if known else "")
        + "Only list companies you are confident exist. Reply with one JSON object and nothing else: "
        + '{"list":[{"name":"official name","what":"one short line on what they do",'
        + f'"industry":"{INDUSTRIES}"' + "}]}"
    )


def report_prompt(company: str, domain: str, ctx: dict, startup_confirmed: bool, live: bool) -> str:
    known = ", ".join(f"{k}: {v}" for k, v in ctx.items() if v)
    how = (
        "Use Google Search to research the company from public sources (website, filings, reputable news). Prefer recent sources."
        if live
        else "You cannot browse the web. Use only your general knowledge of public information, and set confidence no higher than medium. Write Not found for anything you are unsure of."
    )
    credit_line = (
        "The seller has confirmed this company is a startup, so offer O12 may be suggested."
        if startup_confirmed
        else "The company is NOT a confirmed startup: never suggest offer O12 and never mention AWS credits."
    )
    return f"""Write a one-page Market Insight Report for a seller at Valamm.AI / VirtualizingHumans.AI who is about to meet this company.

Company: {company}{f" (website: {domain})" if domain else ""}
What the seller already knows: {known or "nothing more"}

{how}

{REP_RULES}

{credit_line}

Our offers (use only these ids in "fit", two to five of them, the most relevant first):
{offers_brief()}

Cover: about the company, products and services, countries present, channels and partners, IT infrastructure and cloud, India market size (TAM, SAM, SOM) for what they sell, Indian government mandates they touch or we can help with (for example DPDP), recent signals, where we can help, and conversation openers.

Reply with exactly one JSON object and nothing else, in this shape (values describe what to write):
{json.dumps(REP_SHAPE, ensure_ascii=False)}"""


def identify_photo_prompt(live: bool) -> str:
    how = (
        "Then use Google Search to confirm which company it is: search for the name you read, and if there is no readable "
        "name, describe the logo (shapes, colours, symbols, letters) and search for it. Prefer the company's official website."
        if live
        else "You cannot search the web here: identify the company only if you clearly recognise the name or logo."
    )
    return (
        "This photo was taken by a seller at a business event. It shows a company logo, name board, banner, badge, "
        "stall, product or screen. First read every piece of text in the photo and study any logo. "
        + how
        + " Reply with one JSON object and nothing else: "
        + '{"found":true|false,"company":"official company name or empty","website":"domain such as example.com or empty",'
        + '"what":"one plain sentence on what the company does","hq":"city, country or empty",'
        + f'"industry":"{INDUSTRIES}","type":"{TYPES}",'
        + '"confidence":"high|medium|low","logo":"one short line describing the logo",'
        + '"lines":["every other company or organisation name readable in the photo, most prominent first"]}. '
        + "Never guess a company you cannot support from the photo or the search results: set found to false instead. "
        + "Use startup only when public information clearly says it is an early-stage startup."
    )


OCR_PROMPT = (
    "This is a photo of a company name board, banner, badge, signboard or website screenshot. "
    "List every company or organisation name you can read, the most prominent first, one per line. "
    "Output only the names. If you cannot read any company name, output exactly NONE."
)
