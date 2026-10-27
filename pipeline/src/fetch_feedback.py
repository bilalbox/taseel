#!/usr/bin/env python3
"""
Pipeline Feedback Retrieval & Triage Tool.

Fetches flagged fatwa & quiz feedback reports from Cloudflare (D1/KV/API)
or local development store, allowing curators to review issues such as:
- wrong principle
- wrong explanation
- textual/clerical error
- no correct option available

Usage:
  python3 pipeline/src/fetch_feedback.py list
  python3 pipeline/src/fetch_feedback.py list --reason wrong_principle
  python3 pipeline/src/fetch_feedback.py list --fatwa baz-18
  python3 pipeline/src/fetch_feedback.py show fb_1730000000_abc123
  python3 pipeline/src/fetch_feedback.py export --output pipeline/data/flagged_reports.json
  python3 pipeline/src/fetch_feedback.py d1-query [--remote]
"""

import argparse
import contextlib
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_API_URL = os.environ.get("FEEDBACK_API_URL", "http://localhost:3000/api/feedback")
ADMIN_KEY = os.environ.get("FEEDBACK_ADMIN_KEY", "")
D1_DB_NAME = "taseel_feedback"

REASON_TITLES = {
    "wrong_principle": "القاعدة المختارة غير صحيحة (Wrong Principle)",
    "wrong_explanation": "التعليل أو التخريج غير دقيق (Wrong Explanation)",
    "clerical_error": "خطأ نصي أو مطبعي (Clerical/Textual Error)",
    "no_correct_option": "لا يوجد خيار صحيح (No Correct Option)",
}


def fetch_from_api(
    base_url: str = DEFAULT_API_URL,
    status: str = "open",
    fatwa_id: str | None = None,
    reason: str | None = None,
    admin_key: str | None = None,
) -> list[dict[str, Any]]:
    """Fetches feedback reports from the HTTP API."""
    params = {"status": status}
    if fatwa_id:
        params["fatwa_id"] = fatwa_id
    if reason:
        params["reason"] = reason

    query_str = urllib.parse.urlencode(params)
    url = f"{base_url}?{query_str}" if query_str else base_url

    req = urllib.request.Request(url)
    key = admin_key or ADMIN_KEY
    if key:
        req.add_header("Authorization", f"Bearer {key}")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("reports", [])
    except urllib.error.URLError as e:
        print(f"⚠️  Could not connect to API at {url}: {e}")
        return []


def query_d1_via_wrangler(remote: bool = False, status: str = "open") -> list[dict[str, Any]]:
    """Queries Cloudflare D1 directly via wrangler CLI."""
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        D1_DB_NAME,
        "--json",
    ]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")

    where_clause = ""
    if status != "all":
        where_clause = f"WHERE status = '{status}'"
    cmd.append(
        f"--command=SELECT * FROM feedback_reports {where_clause} ORDER BY created_at DESC LIMIT 100"
    )

    print(f"Executing: {' '.join(cmd)}")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        raw = json.loads(res.stdout)
        if isinstance(raw, list) and raw and "results" in raw[0]:
            return raw[0]["results"]
        return []
    except subprocess.CalledProcessError as e:
        print(f"Wrangler error: {e.stderr}")
        return []
    except Exception as e:
        print(f"Error parsing wrangler output: {e}")
        return []


def format_report_summary(rep: dict[str, Any]) -> str:
    """Formats a concise one-line summary for listing."""
    rid = rep.get("id", "unknown")[:14]
    fid = rep.get("fatwa_id", "")
    scholar = rep.get("scholar_name") or ""
    chapter = rep.get("topic_chapter") or ""
    reason = rep.get("reason", "")
    reason_ar = REASON_TITLES.get(reason, reason)
    comment = rep.get("user_comment") or "—"
    if len(comment) > 40:
        comment = comment[:37] + "..."

    created = rep.get("created_at", "")[:16].replace("T", " ")
    status = rep.get("status", "open")
    status_icon = "🔴" if status == "open" else "🟢"

    return f"{status_icon} [{rid}] {fid:<9} | {scholar:<9} | {chapter:<8} | {reason_ar:<35} | «{comment}» ({created})"


def display_report_details(rep: dict[str, Any]) -> None:
    """Displays full details of a single report."""
    print("\n" + "=" * 70)
    print(f"📋 Feedback Report: {rep.get('id')}")
    print("=" * 70)
    print(f"• Status:           {rep.get('status')} (Created: {rep.get('created_at')})")
    print(f"• Fatwa ID:         {rep.get('fatwa_id')}")
    print(f"• Scholar:          {rep.get('scholar_name')} | Chapter: {rep.get('topic_chapter')}")
    reason = str(rep.get("reason") or "")
    print(f"• Reason Flagged:   {REASON_TITLES.get(reason, reason)}")
    if rep.get("principle_text"):
        print(f"• Current Principle: «{rep.get('principle_text')}» ({rep.get('principle_id')})")
    if rep.get("question_excerpt"):
        print(f"• Question Excerpt: «{rep.get('question_excerpt')}»")
    if rep.get("user_comment"):
        print(f"• User Comment:     «{rep.get('user_comment')}»")

    options = rep.get("options_shown")
    if isinstance(options, str):
        with contextlib.suppress(BaseException):
            options = json.loads(options)
    if isinstance(options, list):
        print("• Quiz Choices Shown:")
        for opt in options:
            mark = "✓ (correct)" if opt.get("is_correct") else " "
            selected = "👉 [SELECTED]" if opt.get("id") == rep.get("user_selected_id") else ""
            print(f"   {mark} {opt.get('text')} {selected}")

    if rep.get("ip_country"):
        print(f"• Origin:           Country={rep.get('ip_country')}")
    if rep.get("resolution_notes"):
        print(f"• Resolution Notes: {rep.get('resolution_notes')} (at {rep.get('reviewed_at')})")
    print("=" * 70 + "\n")


def cmd_list(args: argparse.Namespace) -> None:
    reports: list[dict[str, Any]] = []
    if args.wrangler or args.remote:
        reports = query_d1_via_wrangler(remote=args.remote, status=args.status)
    else:
        reports = fetch_from_api(
            base_url=args.url,
            status=args.status,
            fatwa_id=args.fatwa,
            reason=args.reason,
            admin_key=args.admin_key,
        )

    print(f"\nFound {len(reports)} feedback report(s) [status={args.status}]:")
    print("-" * 110)
    for r in reports:
        print(format_report_summary(r))
    print("-" * 110 + "\n")


def cmd_show(args: argparse.Namespace) -> None:
    reports = fetch_from_api(base_url=args.url, status="all", admin_key=args.admin_key)
    match = next(
        (r for r in reports if r.get("id") == args.id or r.get("id", "").startswith(args.id)), None
    )
    if not match and (args.wrangler or args.remote):
        d1_reps = query_d1_via_wrangler(remote=args.remote, status="all")
        match = next(
            (r for r in d1_reps if r.get("id") == args.id or r.get("id", "").startswith(args.id)),
            None,
        )

    if not match:
        print(f"❌ Report '{args.id}' not found.")
        return

    display_report_details(match)


def cmd_export(args: argparse.Namespace) -> None:
    reports = fetch_from_api(base_url=args.url, status=args.status, admin_key=args.admin_key)
    if not reports and (args.wrangler or args.remote):
        reports = query_d1_via_wrangler(remote=args.remote, status=args.status)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ Exported {len(reports)} report(s) to {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Taseel Feedback Retrieval Tool")
    parser.add_argument(
        "--url", default=DEFAULT_API_URL, help=f"Feedback API URL (default: {DEFAULT_API_URL})"
    )
    parser.add_argument("--admin-key", default=ADMIN_KEY, help="Admin authorization key")
    parser.add_argument("--wrangler", action="store_true", help="Query local wrangler D1 directly")
    parser.add_argument(
        "--remote", action="store_true", help="Query remote Cloudflare D1 via wrangler"
    )

    sub = parser.add_subparsers(dest="cmd", required=True)

    # list
    p_list = sub.add_parser("list", help="List feedback reports")
    p_list.add_argument(
        "--status", default="open", choices=["open", "reviewed", "resolved", "dismissed", "all"]
    )
    p_list.add_argument("--fatwa", help="Filter by fatwa ID (e.g. baz-18)")
    p_list.add_argument("--reason", choices=list(REASON_TITLES.keys()), help="Filter by reason")

    # show
    p_show = sub.add_parser("show", help="Show full details of a specific report")
    p_show.add_argument("id", help="Report ID (or ID prefix)")

    # export
    p_exp = sub.add_parser("export", help="Export reports to JSON")
    p_exp.add_argument(
        "--output", default="pipeline/data/feedback_export.json", help="Output JSON path"
    )
    p_exp.add_argument("--status", default="open", choices=["open", "all", "resolved"])

    args = parser.parse_args()

    if args.cmd == "list":
        cmd_list(args)
    elif args.cmd == "show":
        cmd_show(args)
    elif args.cmd == "export":
        cmd_export(args)


if __name__ == "__main__":
    main()
