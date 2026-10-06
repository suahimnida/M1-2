"""시계열 분석 → 요약 정보 생성. 이 요약이 AI 시스템 프롬프트에 주입된다."""
from datetime import date
from statistics import mean
from typing import List

WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


def _avg(values) -> float:
    values = list(values)
    return round(mean(values), 2) if values else 0.0


def _trend(recent: List[float], previous: List[float]) -> str:
    if not recent or not previous:
        return "판단 불가"
    diff = mean(recent) - mean(previous)
    if diff >= 0.5:
        return "증가"
    if diff <= -0.5:
        return "감소"
    return "유지"


def compute_summary(rows: List[dict]) -> dict:
    """rows: data 컬렉션 문서 목록 (순서 무관). DB와 분리된 순수 함수라 테스트하기 쉽다."""
    if not rows:
        return {"count": 0, "text": "아직 컨디션 기록이 없습니다."}

    rows = sorted(rows, key=lambda r: r["date"])
    values = [r["value"] for r in rows]
    stresses = [r.get("stress", 5) for r in rows]
    sleeps = [r.get("sleep_hours", 7) for r in rows]

    last7, prev7 = rows[-7:], rows[-14:-7]
    trend = _trend([r["value"] for r in last7], [r["value"] for r in prev7])
    stress_trend = _trend([r.get("stress", 5) for r in last7], [r.get("stress", 5) for r in prev7])

    # 요일별 평균 컨디션
    by_weekday = {}
    for r in rows:
        wd = WEEKDAYS[date.fromisoformat(r["date"]).weekday()]
        by_weekday.setdefault(wd, []).append(r["value"])
    weekday_avg = {wd: _avg(v) for wd, v in by_weekday.items()}
    best_day = max(weekday_avg, key=weekday_avg.get)
    worst_day = min(weekday_avg, key=weekday_avg.get)

    # 수면과 컨디션의 관계
    short_sleep = [r["value"] for r in rows if r.get("sleep_hours", 7) < 6]
    enough_sleep = [r["value"] for r in rows if r.get("sleep_hours", 7) >= 7]

    latest = rows[-1]
    summary = {
        "period": {"start": rows[0]["date"], "end": latest["date"]},
        "count": len(rows),
        "condition": {"avg": _avg(values), "max": max(values), "min": min(values)},
        "stress_avg": _avg(stresses),
        "sleep_avg": _avg(sleeps),
        "trend": trend,
        "stress_trend": stress_trend,
        "recent7_avg": _avg(r["value"] for r in last7),
        "high_stress_days_recent30": sum(1 for r in rows[-30:] if r.get("stress", 5) >= 7),
        "best_weekday": best_day,
        "worst_weekday": worst_day,
        "short_sleep_condition_avg": _avg(short_sleep),
        "enough_sleep_condition_avg": _avg(enough_sleep),
        "latest": {
            "date": latest["date"],
            "value": latest["value"],
            "stress": latest.get("stress"),
            "sleep_hours": latest.get("sleep_hours"),
            "goal": latest.get("goal"),
            "memo": latest.get("memo", ""),
        },
        "recent7": [
            {k: r.get(k) for k in ("date", "value", "stress", "sleep_hours", "goal", "memo")}
            for r in last7
        ],
    }
    summary["text"] = to_prompt_text(summary)
    return summary


def to_prompt_text(s: dict) -> str:
    lines = [
        f"- 기록 기간: {s['period']['start']} ~ {s['period']['end']} (총 {s['count']}일)",
        f"- 컨디션(1~10): 평균 {s['condition']['avg']}, 최고 {s['condition']['max']}, 최저 {s['condition']['min']}",
        f"- 최근 7일 평균 컨디션: {s['recent7_avg']} (직전 7일 대비 {s['trend']})",
        f"- 평균 스트레스: {s['stress_avg']} (최근 추세 {s['stress_trend']}), 최근 30일 중 고스트레스(7 이상) {s['high_stress_days_recent30']}일",
        f"- 평균 수면: {s['sleep_avg']}시간 / 수면 6시간 미만일 때 컨디션 평균 {s['short_sleep_condition_avg']}, 7시간 이상일 때 {s['enough_sleep_condition_avg']}",
        f"- 컨디션이 가장 좋은 요일: {s['best_weekday']}, 가장 낮은 요일: {s['worst_weekday']}",
        "- 가장 최근 기록: "
        f"{s['latest']['date']} 컨디션 {s['latest']['value']}, 스트레스 {s['latest']['stress']}, "
        f"수면 {s['latest']['sleep_hours']}시간, 목적 '{s['latest']['goal'] or '없음'}', 메모 '{s['latest']['memo'] or '없음'}'",
        "- 최근 7일 기록:",
    ]
    for r in s["recent7"]:
        lines.append(
            f"  · {r['date']}: 컨디션 {r['value']}, 스트레스 {r['stress']}, 수면 {r['sleep_hours']}h, "
            f"목적 {r['goal'] or '-'}, 메모 {r['memo'] or '-'}"
        )
    return "\n".join(lines)


def build_summary() -> dict:
    from services.data_service import list_data
    return compute_summary(list_data())
