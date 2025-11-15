import cv2
import whisper
import face_recognition
import os
import numpy as np

VIDEO_PATH = "/Users/nikul/Desktop/hack/today.MP4"
OUTPUT_DIR = os.path.join(os.path.dirname(VIDEO_PATH), "faces_unique")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# === Step 1: Load Whisper model ===
print("Loading Whisper model...")
model = whisper.load_model("large")
result = model.transcribe(VIDEO_PATH, language="English", fp16=False)

# === Step 2: Process video and save unique faces ===
video = cv2.VideoCapture(VIDEO_PATH)
fps = int(video.get(cv2.CAP_PROP_FPS))
interval = 5  # seconds between samples

known_encodings = []
unique_faces = []
frame_num = 0

print("\nAnalyzing faces in video...")

while True:
    ret, frame = video.read()
    if not ret:
        break
    timestamp = frame_num / fps

    # sample every X seconds
    if frame_num % (fps * interval) == 0:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb)
        encodings = face_recognition.face_encodings(rgb, locations)

        for i, (encoding, (top, right, bottom, left)) in enumerate(zip(encodings, locations)):
            # check if face is already known
            matches = face_recognition.compare_faces(known_encodings, encoding, tolerance=0.25)
            if not any(matches):  # new unique person
                known_encodings.append(encoding)
                face_image = frame[top:bottom, left:right]
                filename = f"person_{len(known_encodings)}.jpg"
                save_path = os.path.join(OUTPUT_DIR, filename)
                cv2.imwrite(save_path, face_image)
                unique_faces.append((timestamp, save_path))
                print(f"🧍 New person detected at {timestamp:.2f}s → saved {filename}")
    frame_num += 1

video.release()

# === Step 3: Save transcription to a text file ===
transcript_path = os.path.splitext(VIDEO_PATH)[0] + "_transcript.txt"

with open(transcript_path, "w", encoding="utf-8") as f:
    f.write("=== Transcript Summary ===\n\n")
    for seg in result["segments"]:
        line = f"[{seg['start']:.2f}s–{seg['end']:.2f}s]: {seg['text'].strip()}\n"
        f.write(line)

print(f"\n✅ Transcript saved to: {transcript_path}")
print(f"✅ Saved {len(unique_faces)} unique face(s) in: {OUTPUT_DIR}")