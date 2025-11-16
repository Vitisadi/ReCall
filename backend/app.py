# app.py
import os
import json
import threading
import time
import re
from dotenv import load_dotenv
from pathlib import Path
from analyzers.face_analyzer import analyze_video
from analyzers.transcript_analyzer import analyze_transcript
from analyzers.enroll_face import enroll
# from analyzers.transcript_analyzer import whisper_model
# from analyzers.face_analyzer import face_app
# from analyzers.transcript_analyzer import whisper_model
from analyzers.face_analyzer import face_app
from services.linkedin_enricher import enrich_linkedin_profile
from services.highlights import (
    detect_and_store_highlights,
    get_upcoming_highlights,
)
from google import genai

print("✅ All AI models preloaded (Whisper + InsightFace). Ready to process requests.")

# 🔹 NEW IMPORTS
from flask import Flask, jsonify, send_from_directory, request

load_dotenv()
BASE_URL = os.getenv("BASE_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# === PATH SETUP ===
BASE_DIR = Path(__file__).resolve().parent
MEMORY_DIR = BASE_DIR / "conversations"
DB_ROOT = BASE_DIR / "faces_db"
FACES_DIR = DB_ROOT / "faces"
TEMP_DIR = DB_ROOT / "temp_crops"

# ✅ Ensure all folders exist
for d in [MEMORY_DIR, DB_ROOT, FACES_DIR, TEMP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# 🔹 Initialize Flask
app = Flask(__name__)

# === API ROUTES ===
# returns people name and image URLs
"""
req: http://localhost:3000/api/people - GET
returns:
[
    {
        "image_url": "http://localhost:3000/faces/tim.jpg",
        "name": "tim"
    },
    {
        "image_url": "http://localhost:3000/faces/parker.jpg",
        "name": "parker"
    },
    {
        "image_url": "http://localhost:3000/faces/nicko.jpg",
        "name": "nicko"
    }
]
"""
@app.route("/api/people", methods=["GET"])
def get_people():
    """Return all recognized people and their images."""
    people = []
    for face_file in FACES_DIR.glob("*.*"):
        if face_file.is_file():
            name = face_file.stem
            headline = ""
            # Try to get the latest headline from conversation file
            conv_path = MEMORY_DIR / f"{name}.json"
            if conv_path.exists():
                try:
                    entries = json.loads(conv_path.read_text(encoding="utf-8"))
                    if entries and isinstance(entries, list):
                        # Get headline from most recent entry
                        for entry in reversed(entries):
                            if entry.get("headline"):
                                headline = entry["headline"]
                                break
                except Exception:
                    pass
            
            people.append({
                "name": name,
                "image_url": f"{BASE_URL}/faces/{face_file.name}",
                "headline": headline
            })
    return jsonify(people)

# return face images
"""
req: http://localhost:3000/faces/tim.jpg - GET
returns: image file
""" 
@app.route("/faces/<filename>")
def serve_face(filename):
    """Serve face images."""
    return send_from_directory(str(FACES_DIR), filename)

# conversational ai route
"""
req: http://localhost:3000/api/people/assistant - POST
body: { "question": "Where does Parker work?" }
returns: relevant snippets across all saved conversations
"""
@app.route("/api/people/assistant", methods=["POST"])
def assistant_people():
    """Return a conversational reply referencing the closest matching person."""
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    if not question:
        return jsonify({"error": "Please provide a question for the assistant."}), 400
    target_name = (
        payload.get("name")
        or payload.get("person")
        or payload.get("person_key")
        or ""
    ).strip()
    normalized_target = target_name.lower() if target_name else None

    matches = find_relevant_people(question, normalized_target)
    if normalized_target:
        matches = [
            match for match in matches if match.get("name", "").lower() == normalized_target
        ]
    if not matches:
        no_data_msg = (
            f"I could not find any saved conversations for {target_name}."
            if normalized_target
            else "I could not find any saved conversations yet."
        )
        return jsonify({
            "question": question,
            "answer": no_data_msg,
            "matches": []
        })

    top_match = matches[0]
    gemini_data = summarize_with_gemini(question, top_match)
    answer = (gemini_data or {}).get("answer", "").strip() if gemini_data else ""
    suggestion = (gemini_data or {}).get("suggestion", "").strip() if gemini_data else ""
    excerpt_from_ai = (gemini_data or {}).get("excerpt") if gemini_data else None
    top_match["excerpt"] = build_contextual_excerpt(top_match, excerpt_from_ai, window=1)

    if not answer:
        if top_match.get("snippet"):
            answer = (
                f"{top_match['name']} ({top_match['speaker']}) mentioned "
                f"\"{top_match['snippet']}\"."
            )
        else:
            answer = (
                f"I could not find anything specific, but the latest note for "
                f"{top_match['name']} didn't include a transcript."
            )

    return jsonify({
        "question": question,
        "answer": answer,
        "suggestion": suggestion,
        "match": top_match,
        "matches": matches
    })

# return conversation history for a person
"""
req: http://localhost:3000/api/conversation/tim - GET
returns: conversation JSON
"""
@app.route("/api/conversation/<name>", methods=["GET"])
def get_conversation(name):
    """Return conversation history for a given person."""
    conv_path = MEMORY_DIR / f"{name}.json"
    if not conv_path.exists():
        return jsonify({
            "name": name,
            "conversation": [],
            "message": "No conversation found for this person."
        }), 404
    try:
        with open(conv_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"name": name, "conversation": data})


@app.route("/api/highlights", methods=["GET"])
def list_highlights():
    """Return upcoming highlight reminders detected from transcripts."""
    highlights = get_upcoming_highlights()
    return jsonify({"highlights": highlights})

# process uploaded video
"""
req: http://localhost:3000/api/process - POST
form-data: file: <video file>
returns: processing result JSON
"""
@app.route("/api/process", methods=["POST"])
def process_upload():
    """Upload a video, process it (face + transcript), and return results."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    curr_time = time.time()
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    uploads_dir = BASE_DIR / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    video_path = uploads_dir / file.filename
    file.save(video_path)

    print(f"📁 Uploaded video saved to: {video_path}")

    try:
        result = process_video(str(video_path))
    except Exception as e:
        print("❌ Error while processing:", e)
        return jsonify({"error": str(e)}), 500

    print(f"🚀 TOTAL VIDEO PROCESSING: {time.time() - curr_time:.2f} seconds.")
    return jsonify(result)

# === GLOBAL THREAD VARS ===
transcript_result = {}
transcript_done = threading.Event()

def run_transcript(video_path):
    """Thread: run Whisper + Gemini transcript analyzer"""
    global transcript_result
    transcript_result = analyze_transcript(video_path)
    transcript_done.set()

def run_face(video_path):
    """Thread: detect face, wait for transcript if new person"""
    face_result = analyze_video(video_path)

    # 🧠 If new face detected, wait for transcript to identify the name
    if face_result["status"] == "new":
        print("🕒 New face detected — waiting for transcript to identify name...")
        transcript_done.wait(timeout=180)  # wait up to 3 minutes for Gemini
        time.sleep(0.10) 

        # 🧩 After transcript finishes, get the detected name
        name = transcript_result.get("guessed_name", "Unknown")
        face_result["name"] = name

        # 🧠 Enroll only after transcript gives a valid name
        face_path = face_result.get("face_path")
        if name and name.lower() != "unknown" and face_path:
            try:
                enroll(face_path, name)
                face_result["auto_enrolled"] = True
                print(f"✅ Auto-enrolled new person as: {name}")
            except Exception as e:
                print(f"⚠️ Enrollment failed for {name}: {e}")
                face_result["auto_enrolled"] = False
        else:
            print("⚠️ Could not auto-enroll — missing name or face path.")
            face_result["auto_enrolled"] = False

    else:
        # 🧠 If existing face matched, no need to wait for transcript
        face_result["auto_enrolled"] = False

    # Merge conversation for return consistency
    face_result["conversation"] = transcript_result.get("conversation", [])
    return face_result

def process_video(video_path):
    print(f"\n🚀 Processing video: {video_path}\n")

    global transcript_result
    transcript_result = {}      # 🔹 clear any old transcript data
    transcript_done.clear()

    face_result_box = {}
    t1 = threading.Thread(target=run_transcript, args=(video_path,))

    def face_thread_wrapper():
        face_result_box["data"] = run_face(video_path)

    t2 = threading.Thread(target=face_thread_wrapper)

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    face_result = face_result_box.get("data", {"status": "unknown"})

    final = {
        "video_path": video_path,
        "guessed_name": transcript_result.get("guessed_name"),
        "conversation": transcript_result.get("conversation", []),
        "keywords": transcript_result.get("keywords", []),
        "headline": transcript_result.get("headline", ""),
        "face_status": face_result.get("status", "unknown"),
        "face_name": face_result.get("name"),
        "auto_enrolled": face_result.get("auto_enrolled", False),
    }

    save_conversation(final)
    print("\n=== FINAL RESULT ===")
    print(json.dumps(final, indent=2))
    return final

def save_conversation(data):
    """Append conversation JSON for each person."""
    name = data.get("face_name") or data.get("guessed_name") or "Unknown"
    path = MEMORY_DIR / f"{name}.json"

    existing = []
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            print(f"⚠️ Could not parse old file for {name}, resetting it.")

    entry = {
        "timestamp": int(time.time()),
        "conversation": data.get("conversation", []),
        "keywords": data.get("keywords", []),
        "headline": data.get("headline", ""),
    }

    latest_profile = next(
        (
            item for item in reversed(existing)
            if isinstance(item, dict) and item.get("linkedin")
        ),
        None
    )
    if latest_profile:
        if latest_profile.get("linkedin"):
            entry["linkedin"] = latest_profile.get("linkedin")
        if latest_profile.get("bio"):
            entry["bio"] = latest_profile.get("bio")

    existing.append(entry)
    path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    print(f"💾 Conversation history updated for: {name}")

    try:
        highlights_created = detect_and_store_highlights(
            person_name=name,
            conversation=entry.get("conversation", []),
            conversation_timestamp=entry.get("timestamp", int(time.time())),
            gemini_client=gemini_client,
            headline=entry.get("headline"),
        )
        if highlights_created:
            print(
                f"⭐ Added {len(highlights_created)} highlight(s) for {name}."
            )
    except Exception as exc:
        print(f"⚠️ Failed to record highlights for {name}: {exc}")

def enrich_latest_linkedin(name, force=False):
    """Fetch or update LinkedIn info for the most recent conversation entry."""
    path = MEMORY_DIR / f"{name}.json"
    if not path.exists():
        return None, "missing_file"

    try:
        entries = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None, "invalid_file"

    if not entries:
        return None, "no_entries"

    latest = entries[-1]
    existing_info = {
        "linkedin": latest.get("linkedin"),
        "bio": latest.get("bio"),
    }

    if existing_info["linkedin"] and not force:
        return existing_info, "already_set"

    if not gemini_client:
        return existing_info if existing_info["linkedin"] else None, "gemini_disabled"

    keywords = latest.get("keywords") or []
    conversation = latest.get("conversation") or []

    try:
        profile_info = enrich_linkedin_profile(
            person_name=name,
            keywords=keywords,
            conversation=conversation,
            gemini_client=gemini_client,
        )
    except Exception as exc:
        print(f"⚠️ LinkedIn enrichment failed for {name}: {exc}")
        return existing_info if existing_info["linkedin"] else None, "error"

    if not profile_info:
        return existing_info if existing_info["linkedin"] else None, "no_match"

    latest.update(profile_info)
    path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    return profile_info, "updated"

# rename person endpoint
@app.route("/api/rename", methods=["POST"])
def rename_person():
    """Rename a person's face file, conversation history, and embeddings."""
    data = request.json
    old_name = data.get("old_name")
    new_name = data.get("new_name")
    
    if not old_name or not new_name:
        return jsonify({"error": "Missing old_name or new_name"}), 400
    
    old_face = FACES_DIR / f"{old_name.lower()}.jpg"
    new_face = FACES_DIR / f"{new_name.lower()}.jpg"
    old_conv = MEMORY_DIR / f"{old_name}.json"
    new_conv = MEMORY_DIR / f"{new_name}.json"
    embeddings_path = DB_ROOT / "embeddings.json"
    
    try:
        # Rename face file
        if old_face.exists():
            old_face.rename(new_face)
            print(f"✅ Renamed face: {old_face} -> {new_face}")
        
        # Rename conversation file
        if old_conv.exists():
            old_conv.rename(new_conv)
            print(f"✅ Renamed conversation: {old_conv} -> {new_conv}")
        
        # Update embeddings.json
        if embeddings_path.exists():
            embeddings = json.loads(embeddings_path.read_text(encoding="utf-8"))
            if old_name in embeddings:
                # Update the key and the path value
                embeddings[new_name] = str(new_face)
                del embeddings[old_name]
                embeddings_path.write_text(json.dumps(embeddings, indent=2), encoding="utf-8")
                print(f"✅ Updated embeddings.json: {old_name} -> {new_name}")
        
        return jsonify({"success": True, "new_name": new_name})
    except Exception as e:
        print(f"❌ Rename failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/conversation/<name>/linkedin", methods=["POST"])
def enrich_linkedin_endpoint(name):
    """Trigger LinkedIn lookup for the most recent entry after user confirmation."""
    payload = request.get_json(silent=True) or {}
    force = bool(payload.get("force"))

    info, status_key = enrich_latest_linkedin(name, force=force)

    if status_key == "missing_file":
        return jsonify({"error": f"No conversation found for {name}."}), 404
    if status_key == "invalid_file":
        return jsonify({"error": f"Conversation file for {name} is corrupted."}), 500
    if status_key == "gemini_disabled":
        return jsonify({"error": "Gemini API not configured."}), 503

    response = {
        "name": name,
        "status": status_key,
        "linkedin": (info or {}).get("linkedin"),
        "bio": (info or {}).get("bio"),
    }
    return jsonify(response)
STOPWORDS = {
    "the", "a", "an", "is", "it", "to", "and", "i", "you", "they", "we", "he", "she",
    "them", "of", "in", "on", "for", "with", "at", "what", "who", "when", "where",
    "how", "are", "was", "be", "do", "does", "did", "this", "that", "their"
}
SELF_SPEAKER_LABELS = {"me", "myself", "user"}

def _tokenize_text(text):
    return [w for w in re.findall(r"\w+", text.lower()) if w and w not in STOPWORDS]

def _collect_person_assets():
    assets = {}
    for face_file in FACES_DIR.glob("*.*"):
        assets[face_file.stem.lower()] = {
            "image_url": f"{BASE_URL}/faces/{face_file.name}" if BASE_URL else None,
            "profile_url": f"{BASE_URL}/api/conversation/{face_file.stem}" if BASE_URL else None,
        }
    return assets

def summarize_with_gemini(question, match):
    if not gemini_client or not GEMINI_API_KEY:
        return None

    conversation = match.get("conversation") or []
    if not conversation:
        return None

    convo_tail = conversation[-24:]
    convo_text = "\n".join(
        f"{turn.get('speaker', 'Unknown')}: {turn.get('text', '').strip()}"
        for turn in convo_tail
        if turn.get("text")
    )

    prompt = f"""
You help answer questions about past conversations between two people.
Return only valid JSON in this format (no markdown):
{{
  "answer": "<concise response>",
  "excerpt": [
    {{"speaker": "...", "text": "..."}}
  ],
  "suggestion": "<optional follow-up suggestion or empty string>"
}}

Rules:
- Excerpt lines must be copied verbatim from the conversation log.
- Provide at most 3 excerpt lines, including context before/after the key line when possible.
- If there is not enough information to answer, set answer exactly to "Not enough information." and return an empty excerpt array.
- When you cannot answer, use "suggestion" to recommend what the user could ask instead (e.g., mention related topics present in the log).
- Do not invent facts not present in the conversation log.

Question: "{question}"

Conversation log:
{convo_text}
"""
    print(prompt)
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash-lite", contents=prompt
        )
        print(response.text)
        raw = (response.text or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`").replace("json", "").strip()
        parsed = json.loads(raw)
        if "suggestion" not in parsed:
            parsed["suggestion"] = ""
        return parsed
    except Exception as exc:
        print(f"⚠️ Gemini summary failed: {exc}")
        return None

def build_contextual_excerpt(match, ai_excerpt, window=1):
    conversation = match.get("conversation") or []
    if not conversation or not isinstance(ai_excerpt, list) or not ai_excerpt:
        match["highlight_index"] = -1
        return []

    highlight_indices = set()
    for entry in ai_excerpt:
        text_norm = (entry or {}).get("text", "").strip().lower()
        if not text_norm:
            continue
        for idx, turn in enumerate(conversation):
            if (turn.get("text") or "").strip().lower() == text_norm:
                highlight_indices.add(idx)
                break

    if highlight_indices:
        center = min(highlight_indices)
    else:
        match["highlight_index"] = -1
        return []

    start = max(0, center - window)
    end = min(len(conversation), center + window + 1)

    excerpt = []
    for idx in range(start, end):
        turn = conversation[idx]
        excerpt.append({
            "speaker": turn.get("speaker", "Unknown"),
            "text": turn.get("text", ""),
            "is_highlight": idx in highlight_indices
        })

    match["highlight_index"] = center
    match["highlight_indices"] = sorted(highlight_indices)
    return excerpt

def find_relevant_people(question, target_name=None):
    """Search saved conversations for entries that best answer the question.

    If target_name is provided, limit the search to that person only.
    """
    tokens = _tokenize_text(question)
    assets = _collect_person_assets()
    matches = []
    normalized_target = target_name.lower() if target_name else None

    for conv_file in MEMORY_DIR.glob("*.json"):
        name = conv_file.stem
        if normalized_target and name.lower() != normalized_target:
            continue
        try:
            entries = json.loads(conv_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        name_lower = name.lower()
        name_boost = 5 if name_lower in tokens else 0

        best_entry = None
        best_score = -1
        best_highlight_idx = -1
        best_timestamp = 0

        for entry in entries:
            conversation = entry.get("conversation", [])
            if not conversation:
                continue

            ts = entry.get("timestamp", 0)
            entry_score = 0
            highlight_idx = 0
            highlight_score = -1

            for idx, turn in enumerate(conversation):
                text = turn.get("text", "")
                if not text:
                    continue
                lower_text = text.lower()
                if tokens:
                    line_score = sum(lower_text.count(tok) for tok in tokens)
                else:
                    line_score = 1

                speaker_label = (turn.get("speaker") or "").strip().lower()
                if line_score > 0:
                    if speaker_label and speaker_label not in SELF_SPEAKER_LABELS:
                        line_score *= 1.6
                    elif speaker_label in SELF_SPEAKER_LABELS:
                        line_score *= 0.6

                entry_score += line_score

                if line_score > highlight_score:
                    highlight_score = line_score
                    highlight_idx = idx

            if not tokens and entry_score == 0 and conversation:
                # fallback to most recent line if no tokens extracted
                entry_score = len(conversation)
                highlight_idx = len(conversation) - 1

            if entry_score > 0:
                entry_score += name_boost

            if entry_score > best_score or (entry_score == best_score and ts > best_timestamp):
                best_entry = entry
                best_score = entry_score
                best_highlight_idx = highlight_idx
                best_timestamp = ts

        if not best_entry and entries:
            best_entry = entries[-1]
            best_timestamp = best_entry.get("timestamp", 0)
            conv = best_entry.get("conversation", [])
            best_highlight_idx = len(conv) - 1 if conv else -1
            best_score = 0

        highlight_turn = None
        snippet_text = None
        conversation_block = best_entry.get("conversation", []) if best_entry else []
        if conversation_block and 0 <= best_highlight_idx < len(conversation_block):
            highlight_turn = conversation_block[best_highlight_idx]
            snippet_text = highlight_turn.get("text")

        person_asset = assets.get(name.lower(), {})
        profile_url = person_asset.get("profile_url")
        if BASE_URL:
            query_parts = []
            if best_timestamp:
                query_parts.append(f"ts={best_timestamp}")
            if best_highlight_idx is not None and best_highlight_idx >= 0:
                query_parts.append(f"highlight={best_highlight_idx}")
            query = f"?{'&'.join(query_parts)}" if query_parts else ""
            profile_url = f"{BASE_URL}/api/conversation/{name}{query}"
        matches.append({
            "name": name,
            "snippet": snippet_text,
            "speaker": (highlight_turn or {}).get("speaker", "Unknown"),
            "timestamp": best_timestamp,
            "score": max(best_score, 0),
            "conversation": conversation_block,
            "highlight_index": best_highlight_idx,
            "highlight_indices": [best_highlight_idx] if best_highlight_idx >= 0 else [],
            "profile_url": profile_url,
            "image_url": person_asset.get("image_url"),
        })

    matches.sort(key=lambda m: (-m["score"], -m["timestamp"]))
    return matches

# === START FLASK APP ===
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
