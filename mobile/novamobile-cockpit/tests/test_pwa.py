import json
import sys
import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))

import app  # noqa: E402


class PwaContractTests(unittest.TestCase):
    def test_manifest_is_scoped_to_mobile_route(self):
        manifest = json.loads((app.STATIC_DIR / "manifest.webmanifest").read_text(encoding="utf-8"))

        self.assertEqual(manifest["start_url"], "/mobile/")
        self.assertEqual(manifest["scope"], "/mobile/")
        self.assertEqual(manifest["display"], "standalone")
        self.assertTrue(manifest["icons"])

    def test_authenticated_data_is_not_precached(self):
        worker = (app.STATIC_DIR / "sw.js").read_text(encoding="utf-8")

        self.assertNotIn('"/mobile/"', worker.split("];", 1)[0])
        self.assertNotIn("/api/", worker)
        self.assertIn("offline.html", worker)

    def test_pwa_routes_use_expected_media_and_cache_headers(self):
        manifest = app.web_manifest()
        worker = app.service_worker()

        self.assertEqual(manifest.media_type, "application/manifest+json")
        self.assertEqual(worker.media_type, "application/javascript")
        self.assertEqual(worker.headers["cache-control"], "no-cache, no-store, must-revalidate")
        self.assertEqual(worker.headers["service-worker-allowed"], "/mobile/")

    def test_index_registers_mobile_scoped_worker(self):
        page = (app.STATIC_DIR / "index.html").read_text(encoding="utf-8")

        self.assertIn('rel="manifest" href="/mobile/manifest.webmanifest"', page)
        self.assertIn('register("/mobile/sw.js", { scope: "/mobile/" })', page)


if __name__ == "__main__":
    unittest.main()
