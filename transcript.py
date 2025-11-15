import whisper
import os
import json
from google import genai

# === Gemini API Key setup (works on both Mac and Android) ===
api_key = ""

# initialize client
client = genai.Client(api_key=api_key)

# === CONFIG ===
VIDEO_PATH = "/Users/nikul/Desktop/hack/spam/videos/tim_nikul.MP4"
TRANSCRIPT_PATH = os.path.splitext(VIDEO_PATH)[0] + "_transcript.txt"
OUTPUT_JSON_PATH = os.path.splitext(VIDEO_PATH)[0] + "_conversation.json"

# === Step 1: Load Whisper model ===
print("🎧 Loading Whisper model...")
model = whisper.load_model("large")

# === Step 2: Transcribe the video ===
print(f"🎙️ Transcribing: {os.path.basename(VIDEO_PATH)} ...")
result = model.transcribe(VIDEO_PATH, language="English", fp16=False)

# === Step 3: Save transcription to text file ===
with open(TRANSCRIPT_PATH, "w", encoding="utf-8") as f:
    f.write("=== Transcript Summary ===\n\n")
    for seg in result["segments"]:
        line = f"[{seg['start']:.2f}s–{seg['end']:.2f}s]: {seg['text'].strip()}\n"
        f.write(line)

print(f"✅ Transcript saved to: {TRANSCRIPT_PATH}")

# === Step 4: Send transcript to Gemini for speaker labeling ===
print("\n🤖 Sending transcript to Gemini for JSON conversation parsing...")

# Read transcript
with open(TRANSCRIPT_PATH, "r", encoding="utf-8") as f:
    transcript_text = f.read()

# === Prompt ===
prompt = f"""
You are an intelligent conversation structuring assistant.  
I will give you a transcript of a two-person conversation (usually between Me and a second person).  
Your job is to:
1. Identify who is speaking in each line using context and natural conversation flow.
2. Return a **JSON array** of objects with the following fields:
   - "speaker": "Me" or "2nd Person"
   - "text": the dialogue
   - "start": start timestamp in seconds (if present)
   - "end": end timestamp in seconds (if present)

Rules:
- Keep the text exactly as in the transcript.
- Assign speakers naturally (questions → Me, replies → 2nd Person).
- If timestamps are missing, use null.
- Return only valid JSON, no comments.

Transcript:

{transcript_text}
"""

# === Send to Gemini ===
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
)

# === Save Gemini output as JSON ===
text_output = response.text.strip()

try:
    json_data = json.loads(text_output)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)
    print(f"✅ Conversation JSON saved to: {OUTPUT_JSON_PATH}")
except json.JSONDecodeError:
    print("⚠️ Gemini returned non-JSON output. Here’s what it said:\n")
    print(text_output)