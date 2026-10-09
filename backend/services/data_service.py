"""data 컬렉션 CRUD."""
from typing import List, Optional

from firebase_admin import firestore

from core.firebase import get_db
from core.utils import now_iso
from schemas.data import ConditionCreate, ConditionUpdate

COLLECTION = "data"


def _col():
    return get_db().collection(COLLECTION)


def _serialize(payload: dict) -> dict:
    if payload.get("date") is not None and not isinstance(payload["date"], str):
        payload["date"] = payload["date"].isoformat()
    return payload


def _normalize(doc: dict) -> dict:
    """Firestore 콘솔에서 직접 고친 값도 읽을 수 있게 형식을 맞춘다."""
    d = dict(doc)
    if hasattr(d.get("date"), "isoformat"):            # 타임스탬프로 저장된 날짜
        d["date"] = d["date"].isoformat()[:10]
    for k in ("value", "stress"):
        if isinstance(d.get(k), str) and d[k].strip().lstrip("-").isdigit():
            d[k] = int(d[k])
    for k in ("sleep_hours", "weight_kg"):
        if isinstance(d.get(k), str):
            try:
                d[k] = float(d[k]) if d[k].strip() else None
            except ValueError:
                pass
    return d


def list_data(limit: Optional[int] = None) -> List[dict]:
    """날짜 최신순."""
    query = _col().order_by("date", direction=firestore.Query.DESCENDING)
    if limit:
        query = query.limit(limit)
    return [{"id": snap.id, **_normalize(snap.to_dict())} for snap in query.stream()]


def get_data(doc_id: str) -> Optional[dict]:
    snap = _col().document(doc_id).get()
    return {"id": snap.id, **snap.to_dict()} if snap.exists else None


def find_by_date(date_str: str) -> Optional[dict]:
    for snap in _col().where("date", "==", date_str).limit(1).stream():
        return {"id": snap.id, **snap.to_dict()}
    return None


def create_data(item: ConditionCreate) -> dict:
    payload = _serialize(item.model_dump())
    payload["created_at"] = payload["updated_at"] = now_iso()
    ref = _col().document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def update_data(doc_id: str, item: ConditionUpdate) -> Optional[dict]:
    ref = _col().document(doc_id)
    if not ref.get().exists:
        return None
    changes = _serialize(item.model_dump(exclude_unset=True, exclude_none=True))
    changes["updated_at"] = now_iso()
    ref.update(changes)
    return get_data(doc_id)


def delete_data(doc_id: str) -> bool:
    ref = _col().document(doc_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True
