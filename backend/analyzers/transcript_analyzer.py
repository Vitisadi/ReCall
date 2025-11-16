import os
import json
import time
from moviepy import VideoFileClip
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech
from google.api_core.client_options import ClientOptions
from dotenv import load_dotenv
from google import genai

# ============================================================
# GOOGLE + GEMINI SETUP
# ============================================================
load_dotenv()

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.join(
    os.path.dirname(__file__),
    "google_key.json"
)

PROJECT_ID = "red-atlas-478321-k3"
REGION = "us"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client_gem = genai.Client(api_key=GEMINI_API_KEY)

VIDEO_PATH = "../../videos/parker.mp4"

# ============================================================
# 1. Extract Audio (MP4 → WAV)
# ============================================================
def extract_audio(video_path):
    wav_path = "temp_audio.wav"
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(wav_path, logger=None)
    return wav_path

# ============================================================
# 2. Google Cloud Chirp 3 Transcription + DIARIZATION
# ============================================================
def transcribe_diarization(audio_path):
    client = SpeechClient(
        client_options=ClientOptions(
            api_endpoint=f"{REGION}-speech.googleapis.com"
        )
    )

    with open(audio_path, "rb") as f:
        audio_content = f.read()

    config = cloud_speech.RecognitionConfig(
        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
        language_codes=["en-US"],
        model="chirp_3",
        features=cloud_speech.RecognitionFeatures(
            diarization_config=cloud_speech.SpeakerDiarizationConfig()
        ),
    )

    request = cloud_speech.RecognizeRequest(
        recognizer=f"projects/{PROJECT_ID}/locations/{REGION}/recognizers/_",
        config=config,
        content=audio_content,
    )

    return client.recognize(request=request)

# ============================================================
# 3. Convert diarization → clean transcript w/ Speaker 0 & 1
# ============================================================
def build_transcript(response):
    all_words = []

    for result in response.results:
        alt = result.alternatives[0]
        for w in alt.words:
            speaker = w.speaker_label if hasattr(w, "speaker_label") else 0
            all_words.append({
                "speaker": speaker,
                "word": w.word,
                "start": w.start_offset.total_seconds()
            })

    all_words.sort(key=lambda x: x["start"])

    # Normalize speaker labels to 0 and 1
    # Get unique speakers and map first speaker to 0, second to 1
    if all_words:
        unique_speakers = sorted(set(w["speaker"] for w in all_words))
        speaker_map = {speaker: idx for idx, speaker in enumerate(unique_speakers)}
        for w in all_words:
            w["speaker"] = speaker_map[w["speaker"]]

    # Group into sentences
    sentences = []
    curr_speaker = None
    curr_sentence = []

    for w in all_words:
        if w["speaker"] != curr_speaker:
            if curr_sentence:
                sentences.append({
                    "speaker": curr_speaker,
                    "text": " ".join(curr_sentence)
                })
            curr_speaker = w["speaker"]
            curr_sentence = [w["word"]]
        else:
            curr_sentence.append(w["word"])

    if curr_sentence:
        sentences.append({
            "speaker": curr_speaker,
            "text": " ".join(curr_sentence)
        })

    return sentences

# ============================================================
# 4. Send clean transcript to Gemini for Name + Keywords
# ============================================================
def ask_gemini(sentences):
    conv_text = "\n".join(
        f"{i+1}. [Speaker {s['speaker']}]: {s['text']}"
        for i, s in enumerate(sentences)
    )

    prompt = f"""
    You are given a conversation between two speakers:

    - **Speaker 0** = "Me" (the person wearing glasses and recording this conversation)
    - **Speaker 1** = The other person whose name you must determine
    
    **IMPORTANT**: Speaker 0 is ALWAYS the first person who speaks in this conversation (the recorder).

    Conversation:
    {conv_text}

    Your tasks:

    1. Identify the **other person's name** using strict, expanded rules:

    A. DIRECT INTRODUCTIONS (Most Reliable)
        - If Speaker 1 says: 
            “I’m X”, “My name is X”, “This is X”, “You can call me X”
          → X is the other person's name.

        - If Speaker 0 says:
            “Nice to meet you, X”, “Good to meet you, X”, “Hi X”, “Hello X”
          → X is the other person's name.

    B. INDIRECT OR DELAYED INTRODUCTIONS
        - If Speaker 1 mentions:
            “People call me X”, “Everyone knows me as X”
          → X is the name.

        - If Speaker 1 mentions:
            “I go by X”, “My friends call me X”
          → X is the name.

    C. MULTIPLE NAMES APPEARING IN THE CONVERSATION
        - If two names appear:
            • The FIRST name mentioned belongs to Speaker 0 (“Me”)
            • The SECOND belongs to Speaker 1 (the other person).

        - If Speaker 0 introduces themselves FIRST:
            “I’m Nikul” → that is Speaker 0’s name, NOT the other person.

        - If both speakers introduce themselves:
            Use Speaker 1’s introduction.

    D. GREETING SCENARIOS
        - If you see "Hey X" or "Hi X" or "Nice to meet you X":
          * The person SAYING this phrase is greeting X
          * X is the OTHER person (the one being greeted)
        
        - If Speaker 0 says "Hey X" → X is Speaker 1's name
        - If Speaker 1 says "Hey X" → X is Speaker 0's name (but Speaker 0 is still "Me")
        
        - Names spoken casually still count:
            "So X, what do you think?"
          → X is the other person's name.

    E. WHEN A THIRD PERSON IS MENTIONED
        - If a name appears in the context of a THIRD person:
            “I talked to John yesterday” → John is NOT the other person.
        - The name must refer to the **active speaking partner**.

    F. QUESTIONS ABOUT THE OTHER PERSON'S NAME
        - If Speaker 0 asks:
            “What was your name again?” or “Sorry, what’s your name?”
          Then whichever name Speaker 1 responds with is the correct name.

    G. NICKNAMES & SHORTENED NAMES
        - If Speaker 1 says something like:
            “I’m Jonathan, but call me Jon”
          → Use the name they prefer (Jon).

    H. PRONOUNS & REFERENCES
        - If someone says:
            “I’m X by the way”
          → X is the other person’s name.

    I. NO NAME FOUND ANYWHERE
        - If no rule above results in a name:
            → guessed_name = "Other"
        - Never invent or hallucinate a name.

    2. Transform the transcript into JSON with labeled speakers:
    **ABSOLUTE RULE - SPEAKER 0 = ME, ALWAYS**: 
    - Speaker 0 is ALWAYS "Me" - this never changes
    - Speaker 1 is ALWAYS the other person (use their guessed_name)
    - Simply replace the labels, do NOT swap or reverse speakers
    
    **Example 1**:
    Input: "1. [Speaker 0]: Hey John, how are you?"
           "2. [Speaker 1]: I'm good, thanks!"
    Output: {{"speaker": "Me", "text": "Hey John, how are you?"}},
            {{"speaker": "John", "text": "I'm good, thanks!"}}
    
    **Example 2**:
    Input: "1. [Speaker 0]: I worked at Google"
           "2. [Speaker 1]: That's cool"
    Output: {{"speaker": "Me", "text": "I worked at Google"}},
            {{"speaker": "Other", "text": "That's cool"}}

    3. Extract up to 6 **search keywords** about the other person (if exists, don't remember stupid things):
    - Company names
    - Schools
    - Locations
    - Job titles

    4. Generate a professional **headline** (like LinkedIn) for the other person:
    - Format: "[Role/Title] @ [Company]" or "[Role] | [Specialty]" or "[Position] at [Organization]"
    - Keep it under 50 characters
    - Use information from the conversation (job title, company, role, etc.)
    - If no professional info is found, use a descriptive phrase based on context
    - Examples: "SWE @ Google", "Student at MIT", "Product Manager | Tech", "Founder @ Startup"
    - If absolutely no info: use or "Contact" or "Friend"

    5. Determine if there's **LinkedIn potential**:
    - Set "has_linkedin_potential" to true if the conversation mentions **at least ONE** of the following:
      * Any company or employer name (e.g., "Google", "Microsoft", "Tesla", "a startup", "my company")
      * Any school, university, or educational institution (e.g., "MIT", "Stanford", "high school", "college")
      * Any job title or professional role (e.g., "engineer", "manager", "student", "developer", "CEO", "intern")
      * Any career-related information (e.g., "I work at", "I study", "my job", "my major", "my team")
    - Set to false ONLY if the conversation is purely casual/personal with absolutely zero professional, educational, or career context
    - Be generous: even one mention of work, school, or professional activity should set this to true

    Output **pure JSON only** in this format:

    {{
    "guessed_name": "Name or 'Other'",
    "headline": "Professional subtitle/headline",
    "conversation": [
        {{
        "speaker": "Me" or "<guessed_name>",
        "text": "the spoken line"
        }}
    ],
    "keywords": ["keyword1", "keyword2"],
    "has_linkedin_potential": true or false
    }}
    """

    response = client_gem.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=prompt
    )

    text_output = response.text.strip()
    
    # Remove markdown code blocks if present
    if text_output.startswith("```"):
        lines = text_output.split("\n")
        text_output = "\n".join(lines[1:-1])  # Remove first and last lines
        if text_output.startswith("json"):
            text_output = text_output[4:].strip()
    
    return json.loads(text_output)

# ============================================================
# MAIN PIPELINE
# ============================================================
def analyze_video(video_path):
    audio_path = extract_audio(video_path)
    g_response = transcribe_diarization(audio_path)
    sentences = build_transcript(g_response)
    final_json = ask_gemini(sentences)
    return final_json

# Alias for app.py compatibility
def analyze_transcript(video_path):
    """Alias for analyze_video to match app.py import."""
    return analyze_video(video_path)

# ============================================================
# RUN
# ============================================================
if __name__ == "__main__":
    result = analyze_video(VIDEO_PATH)
    print(json.dumps(result, indent=2))