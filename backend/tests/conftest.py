import os
import sys
from pathlib import Path

# isolated SQLite file and a fake key, set before the app is imported
TMP = Path(__file__).parent / "_test.db"
if TMP.exists():
    TMP.unlink()
os.environ["DATABASE_URL"] = ""
os.environ["GEMINI_API_KEY"] = ""
os.environ["AI_VERTEX_PROJECT"] = ""
os.environ["APP_ACCESS_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.config as config  # noqa: E402

object.__setattr__(config.settings, "database_url", f"sqlite:///{TMP.as_posix()}")
