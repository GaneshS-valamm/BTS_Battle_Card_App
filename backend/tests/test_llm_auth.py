"""Gemini client initialisation: Vertex AI API key only, never Application Default Credentials."""
import google.auth
import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from app import llm
from app.config import settings
from app.main import app

FAKE_KEY = "AQ.fake-test-key-123"


@pytest.fixture()
def no_adc(monkeypatch):
    """Fail the test if anything asks google.auth for default credentials."""
    def boom(*a, **kw):
        raise AssertionError("ADC must not be used")
    monkeypatch.setattr(google.auth, "default", boom)
    monkeypatch.setattr("google.genai._api_client.load_auth", boom, raising=False)
    for v in ("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "GOOGLE_APPLICATION_CREDENTIALS"):
        monkeypatch.delenv(v, raising=False)


def _set(**kw):
    for k, v in kw.items():
        object.__setattr__(settings, k, v)


@pytest.fixture(autouse=True)
def restore():
    saved = (settings.vertex_api_key, settings.vertex_project, settings.vertex_location)
    yield
    _set(vertex_api_key=saved[0], vertex_project=saved[1], vertex_location=saved[2])
    llm._client = None


def test_key_with_project_and_location(no_adc):
    _set(vertex_api_key=FAKE_KEY, vertex_project="my-proj", vertex_location="asia-south1")
    a = llm.make_client()._api_client
    assert a.vertexai and a.api_key == FAKE_KEY and a._credentials is None
    assert a.project == "my-proj" and a.location == "asia-south1"
    assert a._http_options.base_url == "https://asia-south1-aiplatform.googleapis.com/"
    assert a._http_options.headers["x-goog-api-key"] == FAKE_KEY


def test_key_only_express_mode(no_adc):
    _set(vertex_api_key=FAKE_KEY, vertex_project="", vertex_location="asia-south1")
    a = llm.make_client()._api_client
    assert a.api_key == FAKE_KEY and a._credentials is None and a.project is None
    assert a._http_options.base_url == "https://aiplatform.googleapis.com/"


def test_missing_key_never_falls_back_to_adc(no_adc):
    _set(vertex_api_key="", vertex_project="my-proj", vertex_location="asia-south1")
    assert settings.llm_configured is False
    with pytest.raises(llm.LLMNotConfigured):
        llm.make_client()
    llm._client = None
    with pytest.raises(llm.LLMNotConfigured):
        llm.client()


def test_key_never_reaches_frontend():
    _set(vertex_api_key=FAKE_KEY)
    assert FAKE_KEY not in repr(settings)
    with TestClient(app) as c:
        for path in ("/api/config", "/api/health", "/api/content"):
            assert FAKE_KEY not in c.get(path).text


@pytest.mark.parametrize("payload,expect", [
    ({"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}, "not valid"),
    ({"error": {"code": 403, "message": "denied", "details": [{"reason": "API_KEY_SERVICE_BLOCKED"}]}}, "restricted"),
    ({"error": {"code": 403, "message": "denied", "details": [{"reason": "SERVICE_DISABLED"}]}}, "not enabled"),
    ({"error": {"code": 403, "message": "Permission 'aiplatform.endpoints.predict' denied", "details": [{"reason": "IAM_PERMISSION_DENIED"}]}}, "Vertex AI User"),
])
def test_key_errors_explained(payload, expect):
    _set(vertex_api_key=FAKE_KEY)
    msg = llm._key_problem(errors.ClientError(payload["error"]["code"], payload))
    assert expect in msg and FAKE_KEY not in msg
