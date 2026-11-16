import json

import pytest
from fastapi.testclient import TestClient

from app import cleaning, llm
from app.config import settings
from app.main import app

REPORT = {
    "recognised": True, "confidence": "high", "about": "Acme makes rockets. We are PDMaaS experts and fully certified.",
    "facts": [{"k": "HQ", "v": "Pune"}], "products": [{"name": "Rocket", "line": "Goes up"}],
    "countries": {"list": ["India"], "india": "HQ in Pune"}, "channels": [{"type": "direct", "detail": "Field sales"}],
    "infra": {"cloud": "AWS", "detail": "Runs on cloud", "evidence": [], "stack": ["Kubernetes"], "ask": "Where do you run?"},
    "market": {"tam": {"v": "$1B", "n": "x"}, "sam": {"v": "$100M", "n": "y"}, "som": {"v": "$10M", "n": "z"}, "year": "2026", "basis": "guess"},
    "mandates": [{"name": "DPDP Act", "why": "personal data"}], "signals": ["Raised funds, Oct 2026"],
    "fit": [{"id": "O12", "why": "AWS credits up to $100K"}, {"id": "O99", "why": "fake"}, {"id": "O1", "why": "agents"}],
    "openers": ["Hi"], "caveats": "verify",
}


@pytest.fixture()
def client(monkeypatch):
    calls = {"n": 0}

    async def fake_ask(prompt, **kw):
        calls["n"] += 1
        if "Market Insight Report" in prompt:
            return llm.LLMResult(text="Here you go " + json.dumps(REPORT), sources=[{"url": "https://acme.example", "title": "Acme"}], searched=True)
        if "List up to 10" in prompt:
            return llm.LLMResult(text=json.dumps({"list": [{"name": "HDFC Capital", "what": "Real estate funds", "industry": "bfsi"}]}))
        if "business event" in prompt:
            return llm.LLMResult(text=json.dumps({"found": True, "company": "Zylo Robotics", "website": "https://www.zylo.ai/about", "what": "Builds warehouse robots", "industry": "manufacturing", "type": "startup", "confidence": "high", "logo": "blue Z", "lines": ["Zylo Robotics", "Booth 12"]}), sources=[{"url": "https://zylo.ai", "title": "Zylo"}])
        if "photo" in prompt:
            return llm.LLMResult(text="ACME CORP\nNONE")
        return llm.LLMResult(text=json.dumps({"recognised": True, "what": "Makes rockets", "industry": "manufacturing", "security_vendor": False, "type": "startup", "confidence": "high", "hq": "Pune"}))

    monkeypatch.setattr(llm, "ask", fake_ask)
    object.__setattr__(settings, "vertex_project", "test-key")
    with TestClient(app) as c:
        c.calls = calls
        yield c
    object.__setattr__(settings, "vertex_project", "")


def test_health_and_content(client):
    assert client.get("/api/health").json()["ok"] is True
    d = client.get("/api/content").json()
    assert len(d["cards"]) == 43 and len(d["offers"]["catalog"]) == 17 and len(d["ents"]) > 100


def test_not_configured_returns_503():
    object.__setattr__(settings, "vertex_project", "")
    object.__setattr__(settings, "vertex_api_key", "")
    with TestClient(app) as c:
        r = c.post("/api/company-check", json={"name": "Acme"})
        assert r.status_code == 503 and r.json()["detail"] == "llm_not_configured"
        assert c.get("/api/config").json()["llm"] is False


def test_company_check_cached(client):
    a = client.post("/api/company-check", json={"name": "Acme Rockets"}).json()
    b = client.post("/api/company-check", json={"name": "Acme Rockets"}).json()
    assert a["industry"] == "manufacturing" and b["cached"] is True and client.calls["n"] == 1


def test_report_gates_credits_and_caches(client):
    assert client.get("/api/report", params={"company": "Acme"}).json()["found"] is False  # nothing before the confirm tap
    assert client.calls["n"] == 0
    r = client.post("/api/report", json={"company": "Acme", "startupConfirmed": False}).json()
    rep = r["report"]
    ids = [f["id"] for f in rep["fit"]]
    assert ids == ["O1"]  # O12 dropped (not a startup), O99 dropped (unknown)
    text = json.dumps(rep)
    assert "PDMaaS" not in text and "certified" not in text.lower()
    assert rep["infra"]["cloud"] == "Unknown"  # no public evidence
    assert rep["sources"][0]["url"] == "https://acme.example"
    again = client.post("/api/report", json={"company": "Acme", "startupConfirmed": False}).json()
    assert again["cached"] is True and client.calls["n"] == 1
    fresh = client.post("/api/report", json={"company": "Acme", "refresh": True, "startupConfirmed": True}).json()
    assert "O12" in [f["id"] for f in fresh["report"]["fit"]] and client.calls["n"] == 2
    # cached startup report viewed for a non-startup: credits offer removed, no new call
    view = client.get("/api/report", params={"company": "Acme", "startupConfirmed": False}).json()
    assert "O12" not in [f["id"] for f in view["report"]["fit"]] and client.calls["n"] == 2


def test_entities_and_ocr_and_logs(client):
    r = client.post("/api/entities", json={"q": "HDFC", "known": ["HDFC Bank"]}).json()
    assert r["list"][0]["name"] == "HDFC Capital"
    o = client.post("/api/ocr", files={"image": ("p.jpg", b"\xff\xd8\xff", "image/jpeg")}).json()
    assert o["lines"] == ["ACME CORP"]
    log = client.post("/api/logs", json={"cardId": "08", "company": "HDFC Bank", "summary": "s"}).json()
    assert client.get("/api/logs").json()["items"][0]["id"] == log["id"]


def test_identify_photo_caches_company_check(client):
    r = client.post("/api/identify-photo", files={"image": ("p.jpg", b"\xff\xd8\xff", "image/jpeg")}).json()
    assert r["found"] and r["company"] == "Zylo Robotics" and r["website"] == "zylo.ai" and r["lines"] == ["Booth 12"]
    n = client.calls["n"]
    c = client.post("/api/company-check", json={"name": "Zylo Robotics"}).json()
    assert c["cached"] is True and c["what"] == "Builds warehouse robots" and client.calls["n"] == n


def test_clean_check_never_trusts_bad_values():
    out = cleaning.clean_check({"industry": "rockets", "type": "huge", "confidence": "sure", "what": "x"})
    assert out["industry"] == "other" and out["type"] == "" and out["confidence"] == "low"
