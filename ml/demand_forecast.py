#!/usr/bin/env python3
"""
Demand forecast for CraveHub / DineIQ.
Uses completed orders from the recent 28-day window and a weekday-weighted
recent-average baseline. Sparse history is reported rather than fabricated.
"""

import sys
import json
import os
import argparse
from datetime import date, datetime, timedelta
from collections import defaultdict

LOOKBACK_DAYS = 28


def fetch_orders_from_db(mongo_uri="mongodb://127.0.0.1:27017/dineiq"):
    try:
        from pymongo import MongoClient
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=1000)
        db = client.get_database()
        orders = list(db.orders.find({"status": "completed"}))
        menu_items = list(db.menuitems.find({}))
        item_category_map = {str(item["_id"]): item.get("category", "General") for item in menu_items}
        for item in menu_items:
            item_category_map[item.get("name")] = item.get("category", "General")
        return orders, item_category_map
    except Exception:
        return None, None

def _parse_order_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return None
    return None


def _forecast_count(daily_values, days, target_date):
    recent_values = daily_values[-7:]
    recent_average = sum(recent_values) / len(recent_values)
    weekday_values = [
        value for day, value in zip(days, daily_values)
        if day.weekday() == target_date.weekday()
    ]
    if len(weekday_values) >= 2:
        weekday_average = sum(weekday_values) / len(weekday_values)
        return 0.6 * weekday_average + 0.4 * recent_average
    return recent_average


def _demand_level(forecast, daily_values):
    positive_values = sorted(value for value in daily_values if value > 0)
    if not positive_values or forecast <= 0:
        return "Low"
    median = positive_values[(len(positive_values) - 1) // 2]
    upper_quartile = positive_values[int((len(positive_values) - 1) * 0.75)]
    if forecast >= upper_quartile:
        return "High"
    if forecast >= median:
        return "Medium"
    return "Low"


def _weekly_trend(daily_values, history_days):
    if history_days < 14:
        return "Insufficient history for trend"
    previous_week = sum(daily_values[-14:-7])
    recent_week = sum(daily_values[-7:])
    if previous_week == 0:
        return "No previous-week baseline" if recent_week else "No recent demand"
    change = round((recent_week / previous_week - 1) * 100)
    if change == 0:
        return "Stable vs previous week"
    return f"{change:+d}% vs previous week"


def analyze_demand(orders, item_category_map=None, as_of=None):
    item_category_map = item_category_map or {}
    as_of = as_of or date.today()
    if isinstance(as_of, datetime):
        as_of = as_of.date()

    target_date = as_of + timedelta(days=1)
    window_start = as_of - timedelta(days=LOOKBACK_DAYS - 1)
    category_daily = defaultdict(lambda: defaultdict(int))
    item_daily = defaultdict(lambda: defaultdict(int))
    item_categories = {}
    order_dates = set()

    for order in orders:
        if order.get("status") != "completed":
            continue
        order_date = _parse_order_date(order.get("createdAt"))
        if order_date is None or not window_start <= order_date <= as_of:
            continue

        categories_in_order = set()
        for item in order.get("items", []):
            name = item.get("name") or "Unknown Item"
            try:
                quantity = max(0, int(item.get("quantity", 1)))
            except (TypeError, ValueError):
                quantity = 0
            if quantity == 0:
                continue

            item_id = str(item.get("menuItem", ""))
            category = item.get("category") or item_category_map.get(item_id) or item_category_map.get(name) or "General"
            categories_in_order.add(category)
            item_daily[name][order_date] += quantity
            item_categories[name] = category

        if categories_in_order:
            order_dates.add(order_date)
            for category in categories_in_order:
                category_daily[category][order_date] += 1

    days = [window_start + timedelta(days=offset) for offset in range(LOOKBACK_DAYS)]
    history_days = len(order_dates)
    confidence = "Low" if history_days < 7 else "Moderate" if history_days < 21 else "High"

    categories_forecast = []
    for category, counts in category_daily.items():
        daily_values = [counts.get(day, 0) for day in days]
        projected = round(_forecast_count(daily_values, days, target_date), 1)
        categories_forecast.append({
            "category": category,
            "demand": _demand_level(projected, daily_values),
            "badge": _demand_level(projected, daily_values).lower(),
            "projectedOrders": projected,
            "trend": _weekly_trend(daily_values, history_days),
        })
    categories_forecast.sort(key=lambda entry: entry["projectedOrders"], reverse=True)

    top_items_forecast = []
    for item_name, counts in item_daily.items():
        daily_values = [counts.get(day, 0) for day in days]
        projected = round(_forecast_count(daily_values, days, target_date), 1)
        top_items_forecast.append({
            "name": item_name,
            "category": item_categories[item_name],
            "demand": _demand_level(projected, daily_values),
            "projectedQuantity": projected,
        })
    top_items_forecast.sort(key=lambda entry: entry["projectedQuantity"], reverse=True)
    top_items_forecast = top_items_forecast[:6]

    if categories_forecast:
        top_category = categories_forecast[0]
        headline = f"{top_category['category']} demand tomorrow: {top_category['demand'].upper()}"
        kitchen_advice = (
            f"Prepare for about {top_category['projectedOrders']} {top_category['category']} orders. "
            f"This estimate uses completed orders from the recent {LOOKBACK_DAYS}-day window."
        )
        status = "success"
    else:
        headline = "Not enough completed orders to forecast demand"
        kitchen_advice = "Record completed orders to build a useful demand history."
        status = "insufficient_data"

    return {
        "status": status,
        "forecastDate": f"Tomorrow ({target_date.strftime('%A')})",
        "headline": headline,
        "kitchenAdvice": kitchen_advice,
        "method": "weekday-weighted recent average",
        "lookbackDays": LOOKBACK_DAYS,
        "historyDays": history_days,
        "confidence": confidence,
        "categories": categories_forecast,
        "topItems": top_items_forecast,
        "generatedAt": datetime.now().isoformat(),
    }

def main():
    parser = argparse.ArgumentParser(description="Demand Forecast for CraveHub / DineIQ")
    parser.add_argument("--json", type=str, help="Raw JSON string containing orders")
    parser.add_argument("--file", type=str, help="Path to JSON file containing orders")
    parser.add_argument("--stdin", action="store_true", help="Read JSON from stdin")
    parser.add_argument("--mongo-uri", type=str, default=os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017/dineiq"))
    args = parser.parse_args()

    orders = None
    item_category_map = {}

    if args.json:
        try:
            payload = json.loads(args.json)
            if isinstance(payload, list):
                orders = payload
            elif isinstance(payload, dict):
                orders = payload.get("orders", [])
                item_category_map = payload.get("itemCategoryMap", {})
        except Exception:
            orders = None

    elif args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                payload = json.load(f)
                if isinstance(payload, list):
                    orders = payload
                elif isinstance(payload, dict):
                    orders = payload.get("orders", [])
                    item_category_map = payload.get("itemCategoryMap", {})
        except Exception:
            orders = None

    elif args.stdin:
        try:
            raw = sys.stdin.read().strip()
            if raw:
                payload = json.loads(raw)
                if isinstance(payload, list):
                    orders = payload
                elif isinstance(payload, dict):
                    orders = payload.get("orders", [])
                    item_category_map = payload.get("itemCategoryMap", {})
        except Exception:
            orders = None

    if orders is None:
        orders, item_category_map = fetch_orders_from_db(args.mongo_uri)

    if orders is None:
        orders = []

    result = analyze_demand(orders, item_category_map)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()

