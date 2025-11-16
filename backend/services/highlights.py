import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

BASE_DIR = Path(__file__).resolve().parent.parent
HIGHLIGHTS_PATH = BASE_DIR / "highlights.json"
MAX_TRANSCRIPT_LINES = 40
MAX_RETURNED_HIGHLIGHTS = 50
VALID_HIGHLIGHT_STATUSES = {"active", "completed", "dismissed"}
DEFAULT_HIGHLIGHT_STATUS = "active"


def _ensure_storage_file() -> None:
    if not HIGHLIGHTS_PATH.exists():
        HIGHLIGHTS_PATH.write_text("[]\n", encoding="utf-8")


_ensure_storage_file()


def _load_store() -> List[Dict[str, Any]]:
    try:
        data = json.loads(HIGHLIGHTS_PATH.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _write_store(rows: Sequence[Dict[str, Any]]) -> None:
    HIGHLIGHTS_PATH.write_text(json.dumps(list(rows), indent=2), encoding="utf-8")


def _parse_event_timestamp(date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    text = date_str.strip()
    if not text:
        return None

    # Replace trailing Z to stay compatible with datetime.fromisoformat
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    dt: Optional[datetime] = None
    try:
        if len(text) == 10:
            dt = datetime.strptime(text, "%Y-%m-%d")
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(text)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

    return int(dt.timestamp()) if dt else None


def _cleanup_stale(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    now_ts = int(time.time())
    fresh: List[Dict[str, Any]] = []
    for row in entries:
        ts = row.get("event_timestamp")
        if not isinstance(ts, (int, float)):
            continue
        # Drop highlights that are more than 1 day past
        if ts < now_ts - 86400:
            continue
        fresh.append(row)
    if len(fresh) != len(entries):
        _write_store(fresh)
    return fresh


def detect_and_store_highlights(
    *,
    person_name: str,
    conversation: Sequence[Dict[str, Any]],
    conversation_timestamp: int,
    gemini_client,
    headline: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Run Gemini highlight extraction and persist any upcoming events."""
    if not gemini_client or not conversation:
        return []

    detected = _detect_highlights_with_gemini(
        person_name=person_name or "Unknown",
        conversation=conversation,
        reference_ts=conversation_timestamp,
        gemini_client=gemini_client,
    )
    if not detected:
        return []

    stored = _upsert_highlights(
        person_name=person_name or "Unknown",
        headline=headline,
        new_highlights=detected,
    )
    return stored


def _detect_highlights_with_gemini(
    *,
    person_name: str,
    conversation: Sequence[Dict[str, Any]],
    reference_ts: int,
    gemini_client,
) -> List[Dict[str, Any]]:
    turns = [
        f"{(turn.get('speaker') or 'Unknown').strip()}: {(turn.get('text') or '').strip()}"
        for turn in conversation
        if (turn.get("text") or "").strip()
    ]
    if not turns:
        return []

    convo_tail = turns[-MAX_TRANSCRIPT_LINES:]
    now_dt = datetime.fromtimestamp(reference_ts, tz=timezone.utc)
    reference_date = now_dt.strftime("%Y-%m-%d")
    convo_text = "\n".join(convo_tail)

    prompt = f"""
You extract actionable reminders from past conversations.
Today's date is {reference_date} (UTC). The following conversation is between Me and {person_name}.

Return JSON only in this format:
{{
  "highlights": [
    {{
      "title": "brief label",
      "description": "explain why this matters",
      "event_date": "YYYY-MM-DD or YYYY-MM-DDTHH:MM (24h, include timezone if known)",
      "category": "birthday | meeting | trip | delivery | follow_up | other",
      "confidence": 0.0-1.0,
      "source_quote": "line copied verbatim where the event was mentioned"
    }}
  ]
}}

Rules:
- Only include events happening today or in the future.
- Convert relative mentions ("in 2 days", "next Friday") into an absolute ISO date using today's date above.
- Skip anything already past or without a concrete timeframe.
- Each source_quote must be copied directly from the transcript.
- Return an empty array if there is nothing upcoming.

Conversation:
{convo_text}
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
        )
        text = (response.text or "").strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
            if text.startswith("json"):
                text = text[4:].strip()
        parsed = json.loads(text)
    except Exception as exc:
        print(f"⚠️ Highlight parsing failed: {exc}")
        return []

    items = parsed.get("highlights") if isinstance(parsed, dict) else None
    if not isinstance(items, list):
        return []
    cleaned: List[Dict[str, Any]] = []
    for row in items:
        if not isinstance(row, dict):
            continue
        row = row.copy()
        row["title"] = (row.get("title") or "").strip()
        row["description"] = (row.get("description") or row["title"]).strip()
        row["event_date"] = (row.get("event_date") or "").strip()
        if not row["title"] or not row["event_date"]:
            continue
        cleaned.append(row)
    return cleaned


def _upsert_highlights(
    *,
    person_name: str,
    headline: Optional[str],
    new_highlights: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    now_ts = int(time.time())
    store = _cleanup_stale(_load_store())
    changed = False
    persisted: List[Dict[str, Any]] = []

    for row in new_highlights:
        event_ts = _parse_event_timestamp(row.get("event_date"))
        if not event_ts:
            continue
        if event_ts < now_ts:
            continue

        summary = row.get("title") or row.get("description")
        if not summary:
            continue
        description = row.get("description") or summary
        source_quote = row.get("source_quote") or ""
        category = row.get("category") or "other"
        confidence = row.get("confidence")
        try:
            confidence_val = float(confidence) if confidence is not None else 0.6
        except (TypeError, ValueError):
            confidence_val = 0.6

        match = next(
            (
                item
                for item in store
                if item.get("person_name", "").lower() == person_name.lower()
                and item.get("summary", "").lower() == summary.lower()
                and item.get("event_date") == row.get("event_date")
            ),
            None,
        )

        payload = {
            "summary": summary,
            "description": description,
            "event_date": row.get("event_date"),
            "event_timestamp": event_ts,
            "source_quote": source_quote,
            "category": category,
            "confidence": confidence_val,
            "person_name": person_name,
            "person_headline": headline or "",
        }

        if match:
            existing_status = match.get("status", DEFAULT_HIGHLIGHT_STATUS)
            match.update(payload)
            match["status"] = existing_status
            match["updated_at"] = now_ts
            changed = True
            persisted.append(match)
        else:
            new_entry = {
                "id": f"hl_{uuid.uuid4().hex[:10]}",
                **payload,
                "created_at": now_ts,
                "status": DEFAULT_HIGHLIGHT_STATUS,
            }
            store.append(new_entry)
            changed = True
            persisted.append(new_entry)

    if changed:
        store.sort(key=lambda row: row.get("event_timestamp", 0))
        _write_store(store)
    return persisted


def get_upcoming_highlights(limit: int = MAX_RETURNED_HIGHLIGHTS) -> List[Dict[str, Any]]:
    now_ts = int(time.time())
    entries = _cleanup_stale(_load_store())
    upcoming: List[Dict[str, Any]] = []
    for row in entries:
        event_ts = row.get("event_timestamp")
        if not isinstance(event_ts, (int, float)):
            continue
        if event_ts < now_ts:
            continue
        if row.get("status", DEFAULT_HIGHLIGHT_STATUS) != DEFAULT_HIGHLIGHT_STATUS:
            continue
        remaining_sec = max(0, event_ts - now_ts)
        days = remaining_sec // 86400
        hours = (remaining_sec % 86400) // 3600
        enriched = dict(row)
        enriched["days_until"] = int(days)
        enriched["hours_until"] = int(hours)
        upcoming.append(enriched)

    upcoming.sort(key=lambda r: r.get("event_timestamp", 0))
    if limit and len(upcoming) > limit:
        upcoming = upcoming[:limit]
    return upcoming


def set_highlight_status(highlight_id: str, raw_status: str):
    status = (raw_status or "").strip().lower()
    if status not in VALID_HIGHLIGHT_STATUSES:
        return None, "invalid_status"

    store = _load_store()
    target = next((item for item in store if item.get("id") == highlight_id), None)
    if not target:
        return None, "not_found"

    now_ts = int(time.time())
    target["status"] = status
    if status == "completed":
        target["completed_at"] = now_ts
        target.pop("dismissed_at", None)
    elif status == "dismissed":
        target["dismissed_at"] = now_ts
        target.pop("completed_at", None)
    else:  # active
        target.pop("completed_at", None)
        target.pop("dismissed_at", None)
    target["updated_at"] = now_ts
    _write_store(store)
    return target, "updated"
