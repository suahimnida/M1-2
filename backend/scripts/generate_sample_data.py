"""현실적인 패턴을 가진 컨디션 샘플 데이터 생성.

패턴
- 주말엔 수면이 늘고 스트레스가 줄어든다
- 마감 주간(7월 말, 9월 말)엔 수면이 줄고 스트레스가 치솟는다
- 수면 부족 → 스트레스 상승 → 컨디션 하락
- 운동 습관이 붙으면서 컨디션이 서서히 오른다
- 몸무게는 64kg에서 서서히 줄다가, 마감 주간엔 살짝 늘어난다

실행: python scripts/generate_sample_data.py
"""
import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

START = date(2026, 6, 1)
END = date(2026, 10, 5)
CRUNCH = [(date(2026, 7, 20), date(2026, 7, 31)), (date(2026, 9, 21), date(2026, 10, 2))]

GOALS = ["체지방 감량", "근력 강화", "체력 향상", "유연성", "회복"]
MEMOS = {
    "tired": ["몸이 무거움", "아침에 일어나기 힘들었음", "카페인으로 버팀", "눈이 뻑뻑함", "낮잠 자고 싶다"],
    "stress": ["과제 마감 압박", "할 일이 너무 많음", "발표 준비로 긴장", "머리가 복잡함", "어깨가 뭉침"],
    "good": ["상쾌하게 일어남", "러닝 기록 갱신", "기분 좋은 하루", "몸이 가벼움", "스트레칭 효과 있음"],
    "normal": ["", "평범한 하루", "점심 많이 먹음", "산책 30분", "하체 운동함", "비 와서 실내 운동", ""],
}


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def in_crunch(d):
    return any(s <= d <= e for s, e in CRUNCH)


def generate():
    rows = []
    weight = 64.0
    days = (END - START).days + 1
    for i in range(days):
        d = START + timedelta(days=i)
        weekend = d.weekday() >= 5
        crunch = in_crunch(d)
        habit = min(1.0, i / 90)

        sleep = random.gauss(7.4 if weekend else 6.6, 0.7) - (1.3 if crunch else 0)
        sleep = round(clamp(sleep, 3.5, 10) * 2) / 2

        stress = random.gauss(3.5 if weekend else 5.0, 1.2) + (2.8 if crunch else 0) + (1 if sleep < 5.5 else 0)
        stress = int(round(clamp(stress, 1, 10)))

        cond = 5 + (sleep - 6.5) * 0.9 - (stress - 5) * 0.45 + habit * 1.3 + random.gauss(0, 0.8)
        cond = int(round(clamp(cond, 1, 10)))

        if cond <= 4 or sleep < 5:
            goal = "회복"
        else:
            goal = random.choices(GOALS[:4], weights=[4, 3, 3, 2])[0]

        if stress >= 7:
            memo = random.choice(MEMOS["stress"])
        elif cond <= 4:
            memo = random.choice(MEMOS["tired"])
        elif cond >= 8:
            memo = random.choice(MEMOS["good"])
        else:
            memo = random.choice(MEMOS["normal"])

        # 몸무게: 평소엔 하루 약 0.025kg 감소, 마감 주간엔 야식으로 증가
        weight += (0.06 if crunch else -0.025) + random.gauss(0, 0.05)
        weight_kg = round(weight + random.gauss(0, 0.25), 1)

        rows.append({
            "date": d.isoformat(),
            "value": cond,
            "memo": memo,
            "stress": stress,
            "sleep_hours": sleep,
            "weight_kg": weight_kg,
            "goal": goal,
        })
    return rows


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent / "sample_data"
    out_dir.mkdir(exist_ok=True)
    rows = generate()

    with open(out_dir / "condition_data.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    with open(out_dir / "condition_data.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    print(f"{len(rows)}개 생성 → {out_dir}")
