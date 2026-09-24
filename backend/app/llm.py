"""Shared DeepSeek (OpenAI-compatible) client and call helpers.

One client for the whole process, with a bounded timeout and retry count, and a
single switch for the model's reasoning ("thinking") mode.
"""

import logging
import time
from typing import Any

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_client: OpenAI | None = None


class LLMNotConfigured(RuntimeError):
    pass


def llm_configured() -> bool:
    key = (settings.deepseek_api_key or "").strip()
    return bool(key) and key != "sk-dummy"


def get_client() -> OpenAI:
    global _client
    if not llm_configured():
        raise LLMNotConfigured("DEEPSEEK_API_KEY is not configured on the server.")
    if _client is None:
        _client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=settings.llm_timeout_s,
            max_retries=settings.llm_max_retries,
        )
    return _client


def chat_completion(messages: list[dict], *, json_mode: bool = False, temperature: float = 0.0,
                    max_tokens: int | None = None, thinking: bool | None = None, label: str = "llm") -> str:
    """Run one chat completion and return the message text.

    `thinking=None` uses settings.llm_thinking. When thinking is off the model
    answers directly, which is several times faster for JSON/extraction tasks.
    """
    kwargs: dict[str, Any] = {"model": settings.deepseek_model, "messages": messages, "temperature": temperature}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    use_thinking = settings.llm_thinking if thinking is None else thinking
    if not use_thinking:
        kwargs["extra_body"] = {"thinking": {"type": "disabled"}}

    start = time.monotonic()
    response = get_client().chat.completions.create(**kwargs)
    elapsed = time.monotonic() - start
    usage = getattr(response, "usage", None)
    logger.info(
        "DeepSeek %s call: %.1fs, completion_tokens=%s, thinking=%s",
        label, elapsed, getattr(usage, "completion_tokens", "?"), use_thinking,
    )
    return response.choices[0].message.content or ""
