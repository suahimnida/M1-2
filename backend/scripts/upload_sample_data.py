"""샘플 CSV를 Firestore data 컬렉션에 업로드.

실행 (backend 폴더에서):
    python scripts/upload_sample_data.py          # 추가
    python scripts/upload_sample_data.py --clear  # 기존 data 전부 지우고 다시 넣기

업로드는 API를 거치지 않으므로 과거 데이터에 대한 음악 자동 생성은 일어나지 않는다.
"""
import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.firebase import get_db  # noqa: E402
from core.utils import now_iso  # noqa: E402
from schemas.data import ConditionCreate  # noqa: E402

CSV_PATH = Path(__file__).resolve().parent.parent / "sample_data" / "condition_data.csv"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear", action="store_true", help="기존 data 컬렉션 삭제 후 업로드")
    args = parser.parse_args()

    db = get_db()
    col = db.collection("data")

    if args.clear:
        removed = 0
        for snap in col.stream():
            snap.reference.delete()
            removed += 1
        print(f"기존 문서 {removed}개 삭제")

    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    batch, count = db.batch(), 0
    for row in rows:
        item = ConditionCreate(**row)  # Pydantic으로 검증 후 저장
        payload = item.model_dump()
        payload["date"] = item.date.isoformat()
        payload["created_at"] = payload["updated_at"] = now_iso()
        batch.set(col.document(), payload)
        count += 1
        if count % 400 == 0:  # Firestore 배치 한도 500
            batch.commit()
            batch = db.batch()
    batch.commit()
    print(f"{count}개 업로드 완료")


if __name__ == "__main__":
    main()
