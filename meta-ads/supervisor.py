"""
Coupon Pulse - Meta Ads Supervisor
Runs results + analyzer and logs recommendations.
DRY-RUN MODE ONLY - no actions taken.
"""

import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from results import fetch_all_results, save_results_json
from analyzer import load_results, print_analysis_report, generate_recommendations, analyze_campaign


LOG_FILE = os.path.join(os.path.dirname(__file__), "supervisor_log.txt")


def log_message(message):
    """Log a message to file and console."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}"

    print(log_line)

    with open(LOG_FILE, 'a') as f:
        f.write(log_line + "\n")


def run_supervision_cycle():
    """
    Run one supervision cycle:
    1. Fetch latest results
    2. Analyze performance
    3. Generate recommendations
    4. Log everything (NO ACTIONS TAKEN)
    """
    log_message("=" * 60)
    log_message("SUPERVISOR CYCLE STARTED")
    log_message("MODE: DRY-RUN (recommendations only, no actions)")
    log_message("=" * 60)

    # Step 1: Fetch results
    log_message("Step 1: Fetching latest ad results...")
    data = fetch_all_results()

    if not data:
        log_message("ERROR: Could not fetch results. Check API credentials.")
        return

    # Save results
    save_results_json(data, "latest_results.json")
    log_message("Results saved to latest_results.json")

    # Step 2: Analyze
    log_message("\nStep 2: Analyzing performance...")

    analysis = {"campaigns": []}
    for campaign_data in data.get("campaigns", []):
        campaign_analysis = analyze_campaign(campaign_data)
        analysis["campaigns"].append(campaign_analysis)

    # Step 3: Generate recommendations
    log_message("\nStep 3: Generating recommendations...")
    recommendations = generate_recommendations(analysis)

    if not recommendations:
        log_message("No recommendations at this time - need more data.")
    else:
        log_message(f"\nFound {len(recommendations)} recommendation(s):")

        for i, rec in enumerate(recommendations, 1):
            log_message(f"\n  [{i}] {rec['message']}")
            if rec.get("action"):
                log_message(f"      Suggested action: {rec['action']}")
            log_message(f"      STATUS: NOT EXECUTED (dry-run mode)")

    # Summary
    log_message("\n" + "=" * 60)
    log_message("CYCLE COMPLETE")
    log_message("=" * 60)

    # Calculate totals
    total_spend = 0
    total_clicks = 0
    total_impressions = 0

    for campaign in data.get("campaigns", []):
        insights = campaign.get("insights")
        if insights:
            total_spend += float(insights.get("spend", 0))
            total_impressions += int(insights.get("impressions", 0))

            for action in insights.get("actions", []):
                if action.get("action_type") == "link_click":
                    total_clicks += int(action.get("value", 0))

    log_message(f"\nTotal Spend: ${total_spend:.2f}")
    log_message(f"Total Impressions: {total_impressions}")
    log_message(f"Total Link Clicks: {total_clicks}")

    if total_clicks > 0:
        avg_cpc = total_spend / total_clicks
        log_message(f"Average CPC: ${avg_cpc:.2f}")

    if total_impressions > 0:
        overall_ctr = (total_clicks / total_impressions) * 100
        log_message(f"Overall CTR: {overall_ctr:.2f}%")

    log_message("\n" + "=" * 60)
    log_message("Next steps:")
    log_message("  - Run this script again in a few hours")
    log_message("  - Review recommendations above")
    log_message("  - Make manual decisions based on insights")
    log_message("=" * 60 + "\n")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("COUPON PULSE - ADS SUPERVISOR")
    print("=" * 60)
    print("\n⚠️  DRY-RUN MODE: No changes will be made to your ads.")
    print("    This script only fetches data and logs recommendations.\n")

    run_supervision_cycle()

    print(f"\nLog saved to: {LOG_FILE}")
