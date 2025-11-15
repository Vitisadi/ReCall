"""
app.py
-------
Video transcription API with optional name parameter.
If 'name' is given, uses it as the other participant's name.
If not, Gemini infers it from the dialogue (e.g., detects if someone says 'Hi Tim').'

- GIVEN NAME
curl -X POST -F "video=@/Users/nikul/Desktop/hack/spam/videos/tim_nikul.MP4" -F "name=Tim" http://127.0.0.1:5000/transcribe

- NO NAME GIVEN
curl -X POST -F "video=@tim_nikul.MP4" http://127.0.0.1:5000/transcribe

"""

from flask import Flask, request, jsonify
import whisper
import os
import json
import tempfile
from google import genai

# === CONFIG ===
API_KEY = ""
MODEL_NAME = "gemini-2.5-flash"

app = Flask(__name__)
client = genai.Client(api_key=API_KEY)

# === Load Whisper model once globally ===
print("🎧 Loading Whisper model (this may take a bit)...")
whisper_model = whisper.load_model("large")


@app.route("/transcribe", methods=["POST"])
def transcribe_video():
    """
    POST /transcribe
    Required: video (file)
    Optional: name (string)
    Example:
      curl -X POST -F "video=@tim.mp4" -F "name=Tim" http://127.0.0.1:5000/transcribe
    """
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    # Optional name input
    other_name = request.form.get("name", "").strip()
    if other_name:
        print(f"🧍 Provided participant name: {other_name}")
    else:
        print("🧩 No name provided — will infer from context.")

    video_file = request.files["video"]

    # Save video temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        video_path = tmp.name
        video_file.save(video_path)

    print(f"🎥 Received video: {os.path.basename(video_path)}")

    try:
        # === Step 1: Transcribe with Whisper ===
        print("🎙️ Transcribing video...")
        result = whisper_model.transcribe(video_path, language="English", fp16=False)

        transcript_text = "\n".join(
            f"[{seg['start']:.2f}s–{seg['end']:.2f}s]: {seg['text'].strip()}"
            for seg in result["segments"]
        )

        # === Step 2: Build Gemini prompt ===
        if other_name:
            prompt = f"""
            You are an intelligent conversation structuring assistant.
            I will give you a transcript of a conversation between Me and {other_name}.
            Return a JSON array of dialogue objects, each with:
              - "speaker": either "Me" or "{other_name}"
              - "text": exact spoken line
              - "start": timestamp start
              - "end": timestamp end

            Keep dialogue text exact, assign speakers naturally (questions → Me, replies → {other_name}),
            and return only valid JSON.

            Transcript:
            {transcript_text}
            """
        else:
            prompt = f"""
            You are an intelligent conversation structuring assistant.
            I will give you a transcript of a two-person conversation.
            Try to infer the other speaker's name naturally (e.g., if someone says 'Hi Tim', assume Tim).
            Return a JSON array of dialogue objects, each with:
              - "speaker": "Me" or the inferred name
              - "text": exact spoken line
              - "start": timestamp start
              - "end": timestamp end
            Return only valid JSON.

            Transcript:
            {transcript_text}
            """

        # === Step 3: Send to Gemini ===
        print("🤖 Sending transcript to Gemini...")
        response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
        text_output = response.text.strip()

        try:
            json_data = json.loads(text_output)
        except json.JSONDecodeError:
            json_data = {"raw_output": text_output}

        os.remove(video_path)  # cleanup temp video

        return jsonify({
            "status": "success",
            "participants": ["Me", other_name or "Inferred"],
            "conversation": json_data
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/")
def home():
    return jsonify({
        "message": "🎬 Video Conversation API is live!",
        "usage": "POST /transcribe with form-data: video=@file.mp4, optional name='Tim'"
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)