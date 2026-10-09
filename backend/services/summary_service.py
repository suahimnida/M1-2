"""시계열 분석 → 요약 정보 생성. 이 요약이 AI 시스템 프롬프트에 주입된다."""
from datetime import date
from statistics import mean
from typing import List, Optional

WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


def _avg(values) -> float:
    values = list(values)
    return round(mean(values), 2) if values else 0.0


def _trend(recent: List[float], previous: List[float], threshold: float = 0.5) -> str:
    if not recent or not previous:
        return "판단 불가"
    diff = mean(recent) - mean(previous)
    if diff >= threshold:
        return "증가"
    if diff <= -threshold:
        return "감소"
    return "유지"


def _weight_summary(rows: List[dict]) -> Optional[dict]:
    """몸무게가 입력된 기록만 모아서 분석. 하나도 없으면 None."""
    ws = [(r["date"], float(r["weight_kg"])) for r in rows if r.get("weight_kg") is not None]
    if not ws:
        return None
    vals = [w for _, w in ws]
    last7, prev7 = vals[-7:], vals[-14:-7]
    return {
        "count": len(ws),
        "latest": round(vals[-1], 1),
        "latest_date": ws[-1][0],
        "avg": round(mean(vals), 1),
        "min": round(min(vals), 1),
        "max": round(max(vals), 1),
        "recent7_avg": round(mean(last7), 1),
        "change7": round(mean(last7) - mean(prev7), 2) if prev7 else None,
        # 몸무게는 0.3kg 이상 차이 나면 증가/감소로 본다
        "trend": _trend(last7, prev7, threshold=0.3),
    }


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

    by_weekday = {}
    for r in rows:
        wd = WEEKDAYS[date.fromisoformat(r["date"]).weekday()]
        by_weekday.setdefault(wd, []).append(r["value"])
    weekday_avg = {wd: _avg(v) for wd, v in by_weekday.items()}
    best_day = max(weekday_avg, key=weekday_avg.get)
    worst_day = min(weekday_avg, key=weekday_avg.get)

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
        "weight": _weight_summary(rows),
        "latest": {
            "date": latest["date"],
            "value": latest["value"],
            "stress": latest.get("stress"),
            "sleep_hours": latest.get("sleep_hours"),
            "weight_kg": latest.get("weight_kg"),
            "goal": latest.get("goal"),
            "memo": latest.get("memo", ""),
        },
        "recent7": [
            {k: r.get(k) for k in ("date", "value", "stress", "sleep_hours", "weight_kg", "goal", "memo")}
            for r in last7
        ],
    }
    summary["text"] = to_prompt_text(summary)
    return summary


def _kg(v) -> str:
    return f"{v}kg" if v is not None else "-"


def to_prompt_text(s: dict) -> str:
    lines = [
        f"- 기록 기간: {s['period']['start']} ~ {s['period']['end']} (총 {s['count']}일)",
        f"- 컨디션(1~10): 평균 {s['condition']['avg']}, 최고 {s['condition']['max']}, 최저 {s['condition']['min']}",
        f"- 최근 7일 평균 컨디션: {s['recent7_avg']} (직전 7일 대비 {s['trend']})",
        f"- 평균 스트레스: {s['stress_avg']} (최근 추세 {s['stress_trend']}), 최근 30일 중 고스트레스(7 이상) {s['high_stress_days_recent30']}일",
        f"- 평균 수면: {s['sleep_avg']}시간 / 수면 6시간 미만일 때 컨디션 평균 {s['short_sleep_condition_avg']}, 7시간 이상일 때 {s['enough_sleep_condition_avg']}",
        f"- 컨디션이 가장 좋은 요일: {s['best_weekday']}, 가장 낮은 요일: {s['worst_weekday']}",
    ]
    w = s.get("weight")
    if w:
        change = f", 직전 7회 대비 {w['change7']:+}kg" if w["change7"] is not None else ""
        lines.append(
            f"- 몸무게: 최근 {w['latest']}kg({w['latest_date']}), 평균 {w['avg']}kg, 범위 {w['min']}~{w['max']}kg, "
            f"최근 7회 평균 {w['recent7_avg']}kg (추세 {w['trend']}{change})"
        )
    else:
        lines.append("- 몸무게: 기록 없음")
    l = s["latest"]
    lines.append(
        "- 가장 최근 기록: "
        f"{l['date']} 컨디션 {l['value']}, 스트레스 {l['stress']}, 수면 {l['sleep_hours']}시간, "
        f"몸무게 {_kg(l.get('weight_kg'))}, 목적 '{l['goal'] or '없음'}', 메모 '{l['memo'] or '없음'}'"
    )
    lines.append("- 최근 7일 기록:")
    for r in s["recent7"]:
        lines.append(
            f"  · {r['date']}: 컨디션 {r['value']}, 스트레스 {r['stress']}, 수면 {r['sleep_hours']}h, "
            f"몸무게 {_kg(r.get('weight_kg'))}, 목적 {r['goal'] or '-'}, 메모 {r['memo'] or '-'}"
        )
    return "\n".join(lines)


def build_summary() -> dict:
    from services.data_service import list_data
    return compute_summary(list_data())
