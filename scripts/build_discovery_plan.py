#!/usr/bin/env python3
"""Deterministic discovery plan for an external crawler/research agent.

This file does NOT claim to scrape sources. Every generated source task starts
as not_started and requires actual source evidence before becoming complete.
"""
import argparse
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def build_plan(on_date):
    rules = load("config/search-rules.json")
    sources = load("config/sources.json")
    regions = load("config/coverage-regions.json")["jurisdictions"]
    watch = load("data/watchlist/projects.json")["projects"]
    if rules["version"] < 6:
        raise ValueError("Expected v6 discovery rules")
    catalog = {s["id"]: s for s in sources["sources"]}
    mandatory_ids = ["hainan_ggzy", "hainan_ccgp",
                     "jurisdiction_government", "ggzy_national", "hnzfcgxh"]
    start = (dt.date.fromisoformat(on_date) - dt.timedelta(days=6)).isoformat()
    broad = rules["discovery_tracks"]["broad"]
    plans = []
    for region in regions:
        city = region["name"]
        sources_for_city = mandatory_ids + (["haikou_ggzy"] if city == "海口市" else [])
        source_queries = []
        for source_id in sources_for_city:
            if source_id not in catalog:
                raise ValueError("Missing source id: " + source_id)
            source = catalog[source_id]
            for track in ("core_theme", "broad_procurement"):
                if track == "core_theme":
                    queries = [
                        city + " " + keyword + " " + kind
                        for keyword in rules["core_keywords"]
                        for kind in ("招标公告", "成交结果")
                    ]
                else:
                    queries = [
                        city + " " + term + " " + notice
                        for group in broad["service_groups"]
                        for term in group
                        for notice in ("比选", "招标", "流标", "结果")
                    ]
                    queries += [
                        city + " " + name + " " + notice
                        for name in broad["project_name_patterns"]
                        for notice in ("可研", "比选", "流标")
                    ]
                source_queries.append({
                    "source_id": source_id,
                    "source_level": source["level"],
                    "city": city,
                    "discovery_track": track,
                    "query_group": track + "_date_and_paged_notice_scan",
                    "date_window": {"from": start, "to": on_date},
                    "queries": list(dict.fromkeys(queries)),
                    "notice_types": broad["notice_groups"] if track == "broad_procurement"
                        else rules["notice_types"],
                    "searched_at": None,
                    "result_count": None,
                    "new_record_count": None,
                    "page_count": 0,
                    "pagination_complete": False,
                    "coverage_status": "not_started"
                })
        for project in watch:
            if project.get("city") != city:
                continue
            source_queries.append({
                "source_id": "project_owner_official",
                "source_level": catalog["project_owner_official"]["level"],
                "city": city, "discovery_track": "known_project_chain",
                "query_group": "official_backfill_project_aliases_and_notice_chain",
                "date_window": {"from": start, "to": on_date},
                "queries": [
                    alias + " " + event
                    for alias in [project["project_name"]] + project.get("project_aliases", [])
                    for event in ("比选", "流标", "二次比选", "成交", "勘察", "测绘", "设计", "合同")
                ],
                "searched_at": None, "result_count": None,
                "new_record_count": None, "page_count": 0,
                "pagination_complete": False, "coverage_status": "not_started",
                "project_id": project["canonical_project_id"]
            })
        plans.extend(source_queries)
    return {
        "version": 1, "date": on_date, "plan_only": True,
        "execution_warning": "A query plan is not a completed crawl; no source count or coverage can be claimed.",
        "jurisdiction_count": len(regions),
        "required_track_count_per_jurisdiction": 2,
        "source_tasks": plans
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat())
    parser.add_argument("--output", help="Optional JSON output file")
    args = parser.parse_args()
    plan = build_plan(args.date)
    data = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        dest = Path(args.output)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(data, encoding="utf-8")
        print(f"{dest}: {len(plan['source_tasks'])} tasks, 19 counties; not executed")
    else:
        print(data)


if __name__ == "__main__":
    main()
