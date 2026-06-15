"""
Coupon Pulse - Meta Ads Analyzer
Analyzes ad performance and outputs recommendations.
Read-only - no modifications to ads.
"""

import os
import json
from datetime import datetime

RESULTS_FILE = os.path.join(os.path.dirname(__file__), "latest_results.json")

# Thresholds for analysis (conservative - respect Meta's learning phase)
MIN_SPEND_FOR_JUDGMENT = 5.00  # Don't judge ads until $5 spent
MIN_IMPRESSIONS_FOR_CTR = 500  # Need enough impressions for meaningful CTR
GOOD_CTR_THRESHOLD = 1.0       # CTR above 1% is good for cold traffic
WEAK_CTR_THRESHOLD = 0.5      # CTR below 0.5% is concerning
HIGH_CPC_THRESHOLD = 2.00     # CPC above $2 is expensive for traffic campaigns
LOW_CPC_THRESHOLD = 0.75      # CPC below $0.75 is good


def load_results():
    """Load the latest results from JSON file."""
    if not os.path.exists(RESULTS_FILE):
        print(f"No results file found at {RESULTS_FILE}")
        print("Run 'python results.py' first to fetch data.")
        return None

    with open(RESULTS_FILE, 'r') as f:
        return json.load(f)


def extract_link_clicks(insights):
    """Extract link clicks from the actions array."""
    if not insights or "actions" not in insights:
        return 0

    for action in insights.get("actions", []):
        if action.get("action_type") == "link_click":
            return int(action.get("value", 0))
    return 0


def calculate_cpc(spend, clicks):
    """Calculate cost per click."""
    if clicks > 0 and spend > 0:
        return spend / clicks
    return None


def analyze_ad(ad_data):
    """
    Analyze a single ad and return assessment.

    Returns dict with:
    - signal: 'good', 'weak', 'insufficient_data', 'no_delivery'
    - metrics: dict of key metrics
    - notes: list of observations
    """
    insights = ad_data.get("insights")
    status = ad_data.get("status", "UNKNOWN")

    result = {
        "id": ad_data["id"],
        "name": ad_data["name"],
        "status": status,
        "signal": "insufficient_data",
        "metrics": {},
        "notes": []
    }

    # Check if ad is even active
    if status != "ACTIVE":
        result["signal"] = "not_active"
        result["notes"].append(f"Ad status is {status}")
        return result

    # No insights means no delivery
    if not insights:
        result["signal"] = "no_delivery"
        result["notes"].append("No impressions yet - ad may still be in review")
        return result

    # Extract metrics
    impressions = int(insights.get("impressions", 0))
    spend = float(insights.get("spend", 0))
    clicks = extract_link_clicks(insights)
    ctr = float(insights.get("ctr", 0))
    cpc = calculate_cpc(spend, clicks)

    result["metrics"] = {
        "impressions": impressions,
        "spend": spend,
        "clicks": clicks,
        "ctr": ctr,
        "cpc": cpc
    }

    # Not enough data yet
    if spend < MIN_SPEND_FOR_JUDGMENT:
        result["signal"] = "insufficient_data"
        result["notes"].append(f"Only ${spend:.2f} spent - need ${MIN_SPEND_FOR_JUDGMENT} for judgment")
        return result

    if impressions < MIN_IMPRESSIONS_FOR_CTR:
        result["signal"] = "insufficient_data"
        result["notes"].append(f"Only {impressions} impressions - need {MIN_IMPRESSIONS_FOR_CTR} for reliable CTR")
        return result

    # Enough data - make assessment
    signals = []

    # CTR analysis
    if ctr >= GOOD_CTR_THRESHOLD:
        signals.append("good")
        result["notes"].append(f"Strong CTR: {ctr:.2f}% (above {GOOD_CTR_THRESHOLD}%)")
    elif ctr <= WEAK_CTR_THRESHOLD:
        signals.append("weak")
        result["notes"].append(f"Low CTR: {ctr:.2f}% (below {WEAK_CTR_THRESHOLD}%)")
    else:
        signals.append("neutral")
        result["notes"].append(f"Average CTR: {ctr:.2f}%")

    # CPC analysis
    if cpc is not None:
        if cpc <= LOW_CPC_THRESHOLD:
            signals.append("good")
            result["notes"].append(f"Good CPC: ${cpc:.2f} (below ${LOW_CPC_THRESHOLD})")
        elif cpc >= HIGH_CPC_THRESHOLD:
            signals.append("weak")
            result["notes"].append(f"High CPC: ${cpc:.2f} (above ${HIGH_CPC_THRESHOLD})")
        else:
            signals.append("neutral")
            result["notes"].append(f"Average CPC: ${cpc:.2f}")

    # No clicks at all with spend
    if clicks == 0 and spend >= MIN_SPEND_FOR_JUDGMENT:
        signals.append("weak")
        result["notes"].append(f"No clicks after ${spend:.2f} spent")

    # Determine overall signal
    if "weak" in signals and "good" not in signals:
        result["signal"] = "weak"
    elif "good" in signals and "weak" not in signals:
        result["signal"] = "good"
    elif "good" in signals and "weak" in signals:
        result["signal"] = "mixed"
    else:
        result["signal"] = "neutral"

    return result


def analyze_adset(adset_data):
    """Analyze an ad set and its ads."""
    insights = adset_data.get("insights")
    status = adset_data.get("status", "UNKNOWN")

    result = {
        "id": adset_data["id"],
        "name": adset_data["name"],
        "status": status,
        "signal": "insufficient_data",
        "metrics": {},
        "notes": [],
        "ads": []
    }

    if status != "ACTIVE":
        result["signal"] = "not_active"
        result["notes"].append(f"Ad set status is {status}")

    if insights:
        impressions = int(insights.get("impressions", 0))
        spend = float(insights.get("spend", 0))
        clicks = extract_link_clicks(insights)
        ctr = float(insights.get("ctr", 0))
        cpc = calculate_cpc(spend, clicks)

        result["metrics"] = {
            "impressions": impressions,
            "spend": spend,
            "clicks": clicks,
            "ctr": ctr,
            "cpc": cpc
        }

    # Analyze each ad
    for ad in adset_data.get("ads", []):
        ad_analysis = analyze_ad(ad)
        result["ads"].append(ad_analysis)

    return result


def analyze_campaign(campaign_data):
    """Analyze a campaign and all its ad sets/ads."""
    result = {
        "id": campaign_data["id"],
        "name": campaign_data["name"],
        "status": campaign_data["status"],
        "insights": campaign_data.get("insights"),
        "ad_sets": []
    }

    for adset in campaign_data.get("ad_sets", []):
        adset_analysis = analyze_adset(adset)
        result["ad_sets"].append(adset_analysis)

    return result


def generate_recommendations(analysis):
    """Generate actionable recommendations based on analysis."""
    recommendations = []

    for campaign in analysis.get("campaigns", []):
        for adset in campaign.get("ad_sets", []):
            adset_name = adset["name"]

            # Check if ad set is not active
            if adset["signal"] == "not_active":
                recommendations.append({
                    "type": "info",
                    "target": adset_name,
                    "message": f"Ad set '{adset_name}' is not active. Turn it on if you want it to run."
                })
                continue

            # Analyze ads within ad set
            good_ads = []
            weak_ads = []
            insufficient_ads = []

            for ad in adset.get("ads", []):
                if ad["signal"] == "good":
                    good_ads.append(ad)
                elif ad["signal"] == "weak":
                    weak_ads.append(ad)
                elif ad["signal"] == "insufficient_data":
                    insufficient_ads.append(ad)

            # Generate recommendations
            if len(good_ads) > 0:
                for ad in good_ads:
                    metrics = ad["metrics"]
                    cpc_value = metrics.get("cpc")
                    cpc_text = f"${cpc_value:.2f}" if cpc_value is not None else "N/A"
                    recommendations.append({
                        "type": "positive",
                        "target": ad["name"],
                        "message": f"✅ WINNER: '{ad['name']}' - CTR: {metrics.get('ctr', 0):.2f}%, CPC: {cpc_text}",
                        "action": "Consider increasing budget for this ad set"
                    })

            if len(weak_ads) > 0:
                for ad in weak_ads:
                    metrics = ad["metrics"]
                    recommendations.append({
                        "type": "negative",
                        "target": ad["name"],
                        "message": f"⚠️ UNDERPERFORMING: '{ad['name']}' - CTR: {metrics.get('ctr', 0):.2f}%, Spend: ${metrics.get('spend', 0):.2f}",
                        "action": "Consider pausing if performance doesn't improve after $10-15 total spend",
                        "notes": ad["notes"]
                    })

            if len(insufficient_ads) > 0 and len(good_ads) == 0 and len(weak_ads) == 0:
                recommendations.append({
                    "type": "info",
                    "target": adset_name,
                    "message": f"📊 COLLECTING DATA: '{adset_name}' - Not enough data yet for judgment",
                    "action": "Wait for more spend before making decisions"
                })

    return recommendations


def compare_ad_sets(analysis):
    """Compare ad sets against each other."""
    comparisons = []

    for campaign in analysis.get("campaigns", []):
        ad_sets = campaign.get("ad_sets", [])

        if len(ad_sets) < 2:
            continue

        # Get ad sets with metrics
        sets_with_data = []
        for adset in ad_sets:
            if adset.get("metrics") and adset["metrics"].get("impressions", 0) > 0:
                sets_with_data.append(adset)

        if len(sets_with_data) < 2:
            comparisons.append({
                "message": "Not enough data to compare ad sets yet"
            })
            continue

        # Compare CTR
        sorted_by_ctr = sorted(sets_with_data, key=lambda x: x["metrics"].get("ctr", 0), reverse=True)

        if len(sorted_by_ctr) >= 2:
            best = sorted_by_ctr[0]
            worst = sorted_by_ctr[-1]

            best_ctr = best["metrics"].get("ctr", 0)
            worst_ctr = worst["metrics"].get("ctr", 0)

            if best_ctr > 0 and worst_ctr > 0:
                diff = ((best_ctr - worst_ctr) / worst_ctr) * 100

                comparisons.append({
                    "winner": best["name"],
                    "loser": worst["name"],
                    "metric": "CTR",
                    "winner_value": f"{best_ctr:.2f}%",
                    "loser_value": f"{worst_ctr:.2f}%",
                    "difference": f"{diff:.0f}% better"
                })

    return comparisons


def print_analysis_report(data):
    """Print a formatted analysis report."""
    print("=" * 70)
    print("COUPON PULSE - ADS PERFORMANCE ANALYSIS")
    print(f"Analysis Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    analysis = {"campaigns": []}

    for campaign_data in data.get("campaigns", []):
        campaign_analysis = analyze_campaign(campaign_data)
        analysis["campaigns"].append(campaign_analysis)

        print(f"\n📊 CAMPAIGN: {campaign_analysis['name']}")
        print(f"   Status: {campaign_analysis['status']}")

        for adset in campaign_analysis.get("ad_sets", []):
            print(f"\n   📁 AD SET: {adset['name']}")
            print(f"      Status: {adset['status']}")
            print(f"      Signal: {adset['signal'].upper()}")

            if adset.get("metrics"):
                m = adset["metrics"]
                print(f"      Metrics: {m.get('impressions', 0)} impr | {m.get('clicks', 0)} clicks | ${m.get('spend', 0):.2f} spent")

            for ad in adset.get("ads", []):
                signal_emoji = {
                    "good": "🟢",
                    "weak": "🔴",
                    "mixed": "🟡",
                    "neutral": "⚪",
                    "insufficient_data": "⏳",
                    "no_delivery": "❌",
                    "not_active": "⏸️"
                }.get(ad["signal"], "❓")

                print(f"\n      {signal_emoji} AD: {ad['name']}")
                print(f"         Signal: {ad['signal'].upper()}")

                if ad.get("metrics"):
                    m = ad["metrics"]
                    cpc_str = f"${m['cpc']:.2f}" if m.get('cpc') else "N/A"
                    print(f"         Impressions: {m.get('impressions', 0)}")
                    print(f"         Clicks: {m.get('clicks', 0)}")
                    print(f"         CTR: {m.get('ctr', 0):.2f}%")
                    print(f"         CPC: {cpc_str}")
                    print(f"         Spend: ${m.get('spend', 0):.2f}")

                for note in ad.get("notes", []):
                    print(f"         → {note}")

    # Comparisons
    print("\n" + "=" * 70)
    print("AD SET COMPARISON")
    print("=" * 70)

    comparisons = compare_ad_sets(analysis)
    if comparisons:
        for comp in comparisons:
            if "message" in comp:
                print(f"\n{comp['message']}")
            else:
                print(f"\n🏆 {comp['winner']} beats {comp['loser']}")
                print(f"   {comp['metric']}: {comp['winner_value']} vs {comp['loser_value']} ({comp['difference']})")
    else:
        print("\nNot enough data for comparison yet.")

    # Recommendations
    print("\n" + "=" * 70)
    print("RECOMMENDATIONS")
    print("=" * 70)

    recommendations = generate_recommendations(analysis)

    if recommendations:
        for rec in recommendations:
            print(f"\n{rec['message']}")
            if rec.get("action"):
                print(f"   → Action: {rec['action']}")
    else:
        print("\nNo recommendations yet - need more data.")

    print("\n" + "=" * 70)
    print("END OF ANALYSIS")
    print("=" * 70)

    return analysis


if __name__ == "__main__":
    print("\nLoading results data...\n")

    data = load_results()

    if data:
        print(f"Data from: {data.get('generated_at', 'unknown')}\n")
        print_analysis_report(data)
    else:
        print("\nRun 'python results.py' first to fetch ad data.")
