"""Regression tests: a broad-track miss must be visible without changing core verification."""
import unittest

from scripts.build_discovery_plan import build_plan, load
from scripts.audit_quality import inspect


class OmissionRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = build_plan("2026-10-23")

    def test_all_19_jurisdictions(self):
        tasks = self.plan["source_tasks"]
        self.assertEqual(len({t["city"] for t in tasks}), 19)
        self.assertTrue(all(t["coverage_status"] == "not_started" for t in tasks))
        self.assertTrue(all(t["result_count"] is None for t in tasks))

    def test_each_city_has_both_tracks(self):
        for city in {t["city"] for t in self.plan["source_tasks"]}:
            tracks = {t["discovery_track"] for t in self.plan["source_tasks"] if t["city"] == city}
            self.assertTrue({"core_theme", "broad_procurement"} <= tracks, city)

    def test_kaiyuan_plaza_discovered_without_core_keyword(self):
        tasks = [t for t in self.plan["source_tasks"] if t["city"] == "澄迈县"]
        broad = [q for t in tasks if t["discovery_track"] == "broad_procurement" for q in t["queries"]]
        linked = [q for t in tasks if t["discovery_track"] == "known_project_chain" for q in t["queries"]]
        self.assertIn("澄迈县 可行性研究 比选", broad)
        self.assertTrue(any("开元广场" in q and "流标" in q for q in linked))

    def test_watchlist_is_not_officially_verified(self):
        project = load("data/watchlist/projects.json")["projects"][0]
        self.assertEqual(project["category"], "related_development_watch")
        self.assertEqual(project["urban_renewal_relation"], "unconfirmed")
        self.assertTrue(all(e["verification_status"] == "pending_official_backfill"
                            for e in project["events"]))
        self.assertEqual(len({e["event_type"] for e in project["events"]}), 2)

    def test_existing_index_mismatch_is_detected(self):
        result = inspect()
        # The check must always return a structured finding and must not
        # silently repair or overwrite the old main-branch data.
        self.assertIn("errors", result)
        self.assertIn("actual_latest_date", result)


if __name__ == "__main__":
    unittest.main()
