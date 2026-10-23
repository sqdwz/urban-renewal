#!/usr/bin/env python3
"""Quality checks for the urban-renewal repository, no network calls.

Exit 1 with --strict if hard consistency errors exist. Incomplete real-world
source coverage is reported, never silently converted into zero results.
"""
import argparse
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def inspect():
    errors, warnings = [], []
    rules, sources, regions = (read("config/" + n) for n in
                               ("search-rules.json", "sources.json", "coverage-regions.json"))
    index = read("data/index.json")
    latest = read("data/latest.json")
    hist = read("data/history/index.json")
    watch = read("data/watchlist/projects.json")
    pending = read("data/queues/official-backfill.json")
    city_names = [x["name"] for x in regions["jurisdictions"]]
    if len(city_names) != 19 or len(set(city_names)) != 19:
        errors.append("Expected exactly 19 unique cities/counties")
    if rules.get("version") != 6:
        errors.append("search-rules version is not v6")
    ids = {src["id"] for src in sources["sources"]}
    for group in sources["jurisdiction_completion_requirements"]["mandatory_source_groups"]:
        if not set(group).issubset(ids):
            errors.append("Mandatory source group refers to unknown id")
    if not rules.get("discovery_tracks", {}).get("broad", {}).get("independent_of_core_keyword"):
        errors.append("Independent broad discovery is disabled")
    if not rules.get("discovery_tracks", {}).get("broad", {}).get("mandatory"):
        errors.append("Broad discovery track is not mandatory")

    for project in watch["projects"]:
        if project["category"] == "related_development_watch" and project.get("urban_renewal_relation") == "unconfirmed":
            if project.get("verification_status") == "verified":
                errors.append(project["canonical_project_id"] + ": unconfirmed watch item marked verified")
        for ev in project.get("events", []):
            if ev.get("source_level") == "D_discovery_only" and ev.get("verification_status") != "pending_official_backfill":
                errors.append(ev.get("id", "unknown") + ": D evidence incorrectly promoted")
    if any(x.get("status") != "done" for x in pending["tasks"]):
        warnings.append("Official backfill queue still contains open tasks")

    listed = index["latest"]
    newest_date = listed["date"]
    path = listed["path"]
    if not (ROOT / path).is_file():
        errors.append("index.latest.path missing: " + path)
        daily = None
    else:
        daily = read(path)
        if daily.get("date") != newest_date:
            errors.append("index.latest.date does not match daily.date")
    if latest.get("date") != newest_date:
        errors.append("data/latest.json date differs from index.latest.date: " +
                      str(latest.get("date")) + " vs " + str(newest_date))
    if daily:
        cities = daily.get("jurisdiction_coverage", daily.get("coverage_by_jurisdiction"))
        if isinstance(cities, list):
            covered = {c.get("city", c.get("name")) for c in cities}
            if not set(city_names).issubset(covered):
                errors.append("Daily report lacks at least one jurisdiction coverage row")
        else:
            warnings.append("Cannot confirm 19 jurisdiction coverage rows (unknown daily layout)")
        if daily.get("scan_status") == "province_complete":
            scans = daily.get("source_audit", [])
            if any(row.get("coverage_status") in ("source_error", "source_unavailable", "in_progress", "searched_partial", "not_started") for row in scans):
                errors.append("Daily report claims province_complete while source audits are unfinished")
        if daily.get("scan_status") != "province_complete":
            warnings.append("Province source audit incomplete; do not claim zero_verified")
    if hist.get("summary", {}).get("total_records") != index.get("history", {}).get("total_records"):
        errors.append("History index count does not match data/index history count")
    try:
        if (dt.date.today() - dt.date.fromisoformat(newest_date)).days > 1:
            warnings.append("index.latest is older than one day (compare in China timezone for production)")
    except (ValueError, TypeError):
        errors.append("Invalid index.latest date")
    return {"passed": not errors, "errors": errors, "warnings": warnings,
            "indexed_date": newest_date, "actual_latest_date": latest.get("date"),
            "history_records": hist.get("summary", {}).get("total_records"),
            "watchlist_projects": len(watch["projects"]),
            "official_backfill_pending": sum(t.get("status") != "done" for t in pending["tasks"])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    result = inspect()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.strict and not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
