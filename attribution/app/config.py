"""Environment config. Loads .env from the repo root, with hackathon defaults."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load the repo-root .env (one level up from attribution/).
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env")

# Nemotron (vLLM, OpenAI-compatible). Default to the documented hackathon ALB;
# override in .env once you're on the venue network.
NEMOTRON_LLM_URL = os.getenv(
    "NEMOTRON_LLM_URL",
    "http://nemotron-fleet-alb-1322439314.us-west-2.elb.amazonaws.com/v1",
).rstrip("/")
NEMOTRON_LLM_MODEL = os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super")
NEMOTRON_API_KEY = os.getenv("NEMOTRON_API_KEY", "") or None

ATTRIBUTION_PORT = int(os.getenv("ATTRIBUTION_PORT", "8001"))
# Parallel echo-scoring calls (one per ablated block). Keep <= server concurrency.
ATTRIBUTION_K = int(os.getenv("ATTRIBUTION_K", "8"))

REQUEST_TIMEOUT_S = float(os.getenv("ATTRIBUTION_TIMEOUT_S", "30"))

# Gradium TTS — used by /synthesize to re-speak a turn's text in a chosen voice.
GRADIUM_API_KEY = os.getenv("GRADIUM_API_KEY", "") or None
GRADIUM_TTS_URL = os.getenv("GRADIUM_TTS_URL", "wss://api.gradium.ai/api/speech/tts")
# Gradium streams 48 kHz mono 16-bit PCM; we wrap it into a WAV for the browser.
GRADIUM_SAMPLE_RATE = int(os.getenv("GRADIUM_SAMPLE_RATE", "48000"))
