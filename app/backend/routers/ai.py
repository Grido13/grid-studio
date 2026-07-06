"""Local AI assistant: proxies chat to a local Ollama model (Gemma), injecting the
current app context (which tab the user is on, the hour, the on-screen numbers) into
the system prompt so the model answers about what the user is actually seeing."""
import json
import os
import urllib.request

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
# gemma4 (Gemma 3n) is multimodal, so it can read the screenshot the app sends.
# gemma3:1b is a fast text-only fallback for when no image is attached.
# gemma3:4b is the reliable local vision model in Ollama (Gemma-3n / "gemma4" returns
# empty output on images in current builds, so it's only a last resort). e2b/e4b stay
# as fallbacks in case a build fixes 3n vision or 3:4b isn't pulled.
VISION_MODELS = [m for m in [os.environ.get("GRID_AI_MODEL", ""),
                             "gemma3:4b", "gemma4:e2b", "gemma4:e4b"] if m]
TEXT_MODELS = ["gemma3:4b", "gemma3:1b"]
_WORKING = None   # model that answered successfully this session (probed lazily)

SYSTEM = """You are the Grid Studio assistant — an expert on the German power grid embedded
in a grid-simulation app. The app simulates the German transmission grid for 2025:
market dispatch (MILP unit commitment on the model's own load), DC power flow on 8,238
line corridors (v8 merged topology), sectioned 110 kV operation with 618 normally-open
ties (v9), and a DSO-to-TSO redispatch cascade (395 DSO pockets curtail or ramp local
generation for their own 110 kV lines; the TSO then redispatches transmission plants
nationally, monitoring every line, and balances the energy; optional N-1 securing stage).

You are given TWO things about what the user currently sees: a CONTEXT JSON of the
on-screen numbers, AND a screenshot of the current view (a map of Germany or charts).
USE THE IMAGE: read the map's colours, bubbles, lines and chart shapes, and refer to
what is actually visible (e.g. "the red overloaded corridor in the north-east").
Answer directly and concisely — 2 to 4 short sentences, plain language, no preamble,
no step-by-step reasoning, no markdown headings. Quantities are MW unless stated.
If neither the image nor the context has the answer, say which view would show it."""


class ChatReq(BaseModel):
    message: str
    context: dict | None = None
    history: list[dict] | None = None   # [{role, content}]
    image: str | None = None            # base64 JPEG of the current view (no data: prefix)


def _have() -> set:
    try:
        with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=3) as r:
            return {m["name"] for m in json.load(r).get("models", [])}
    except Exception:
        return set()


def _installed(cands: list[str], have: set) -> list[str]:
    """Keep only candidates Ollama actually has (allowing tag-prefix matches)."""
    out = []
    for c in cands:
        if c in have or any(h.startswith(c) for h in have):
            out.append(c)
    return out


def _pick_model() -> str:
    have = _have()
    for c in _installed(VISION_MODELS + TEXT_MODELS, have):
        return c
    return next(iter(have), "gemma3:1b")


@router.post("/chat")
def chat(req: ChatReq):
    global _WORKING
    have_img = bool(req.image)
    msgs = [{"role": "system",
             "content": SYSTEM + "\n\nCONTEXT (what the user sees now):\n"
             + json.dumps(req.context or {}, ensure_ascii=False)}]
    for m in (req.history or [])[-6:]:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            msgs.append({"role": m["role"], "content": str(m["content"])[:2000]})
    have = _have()

    def _run(candidates, with_image):
        """Try each candidate; return (reply, model) on the first non-empty answer.
        Empty content (some vision builds emit nothing on images) counts as a miss."""
        msg = dict(user_msg)
        if with_image and have_img:
            msg["images"] = [req.image]   # Ollama takes base64 images per message
        body_msgs = msgs + [msg]
        for model in candidates:
            body = json.dumps({"model": model, "messages": body_msgs, "stream": False,
                               "options": {"temperature": 0.3, "num_ctx": 4096,
                                           "num_predict": 320}}).encode()
            try:
                r = urllib.request.Request(f"{OLLAMA}/api/chat", data=body,
                                           headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(r, timeout=120) as resp:
                    out = json.load(resp)
                if out.get("error"):
                    tried.append(model); continue
                reply = (out.get("message", {}).get("content") or "").strip()
                if reply:
                    return reply, model
                tried.append(model + "(empty)")
            except Exception:
                tried.append(model)
        return None, None

    user_msg = {"role": "user", "content": req.message[:2000]}
    tried = []
    # Prefer a model that already worked this session so we don't re-pay a cold load.
    if have_img:
        cands = _installed(([_WORKING] if _WORKING in VISION_MODELS else []) + VISION_MODELS, have)
        reply, model = _run(cands, with_image=True)
        if reply:
            _WORKING = model
            return {"reply": reply, "model": model, "saw_image": True}
        # Every vision model failed (or returned nothing) on the image — still answer
        # from the on-screen numbers with a text model rather than going blank.
        tcands = _installed(TEXT_MODELS, have) or list(have)[:1]
        reply, model = _run(tcands, with_image=False)
        if reply:
            return {"reply": reply, "model": model, "saw_image": False}
    else:
        cands = _installed(([_WORKING] if _WORKING else []) +
                           VISION_MODELS + TEXT_MODELS, have) or list(have)[:1]
        reply, model = _run(cands, with_image=False)
        if reply:
            _WORKING = model
            return {"reply": reply, "model": model, "saw_image": False}

    return {"reply": "No local model could answer (tried: " + ", ".join(tried or ["none"])
                     + "). Check `ollama serve` and available RAM.", "error": True}


@router.get("/status")
def status():
    try:
        with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=2) as r:
            models = [m["name"] for m in json.load(r).get("models", [])]
        return {"ok": True, "model": _pick_model(), "available": models}
    except Exception:
        return {"ok": False, "model": None, "available": []}
