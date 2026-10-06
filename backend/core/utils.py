from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_kst() -> str:
    return datetime.now(KST).date().isoformat()
