"""Build the read-only GitHub Pages preview from the app's demo catalog."""

import json
import shutil
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def build():
    output = ROOT / "docs"
    output.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory() as temporary:
        original_db = server.DB_PATH
        try:
            server.DB_PATH = Path(temporary) / "preview.sqlite3"
            server.init_db()
            with server.db() as connection:
                catalog = server.public_menu(connection)
        finally:
            server.DB_PATH = original_db

    (output / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sources = {
        "index.html": ROOT / "preview" / "index.html",
        "app.js": ROOT / "preview" / "app.js",
        "preview.css": ROOT / "preview" / "preview.css",
        "core.js": ROOT / "public" / "core.js",
        "views.js": ROOT / "public" / "views.js",
        "styles.css": ROOT / "public" / "styles.css",
    }
    for destination, source in sources.items():
        shutil.copyfile(source, output / destination)
    (output / ".nojekyll").touch()
    print(f"Preview siap di {output}")


if __name__ == "__main__":
    build()
