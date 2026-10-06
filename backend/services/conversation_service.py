"""conversations 컬렉션."""
from typing import List, Optional

from firebase_admin import firestore

from core.firebase import get_db
from core.utils import now_iso

COLLECTION = "conversations"


def _col():
    return get_db().collection(COLLECTION)


def _make_title(messages: List[dict]) -> str:
    first = next((m["content"] for m in messages if m["role"] == "user"), "새 대화")
    first = first.replace("\n", " ").strip()
    return first[:30] + ("…" if len(first) > 30 else "")


def create_conversation(messages: List[dict], title: Optional[str] = None) -> dict:
    now = now_iso()
    for m in messages:
        if not m.get("timestamp"):
            m["timestamp"] = now
    payload = {
        "title": title or _make_title(messages),
        "messages": messages,
        "created_at": now,
        "updated_at": now,
    }
    ref = _col().document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def append_messages(conv_id: str, new_messages: List[dict]) -> Optional[dict]:
    ref = _col().document(conv_id)
    snap = ref.get()
    if not snap.exists:
        return None
    # ArrayUnion은 같은 내용의 메시지를 합쳐버리므로 직접 이어 붙인다
    messages = snap.to_dict().get("messages", []) + new_messages
    ref.update({"messages": messages, "updated_at": now_iso()})
    return {"id": conv_id, **ref.get().to_dict()}


def list_conversations() -> List[dict]:
    query = _col().order_by("updated_at", direction=firestore.Query.DESCENDING)
    items = []
    for snap in query.stream():
        d = snap.to_dict()
        msgs = d.get("messages", [])
        last = msgs[-1]["content"] if msgs else ""
        items.append({
            "id": snap.id,
            "title": d.get("title", "새 대화"),
            "message_count": len(msgs),
            "preview": last[:60],
            "created_at": d.get("created_at"),
            "updated_at": d.get("updated_at"),
        })
    return items


def get_conversation(conv_id: str) -> Optional[dict]:
    snap = _col().document(conv_id).get()
    return {"id": snap.id, **snap.to_dict()} if snap.exists else None


def delete_conversation(conv_id: str) -> bool:
    ref = _col().document(conv_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True
