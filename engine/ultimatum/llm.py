"""LLM layer. Providers:
- ClaudeLLM: Anthropic Messages API, optionally with the server-side web search tool, so research
  is grounded in the internet with sources.
- FakeLLM: offline fixtures for development and tests (ULTIMATUM_LLM=fake).
Agents only call `complete()` / `complete_json()`, so swapping providers is a one-line change.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class LLMResult:
    text: str
    sources: list[dict] = field(default_factory=list)
    truncated: bool = False


class LLMError(RuntimeError):
    pass


# ── Robust JSON reader for real model output (bug sweep 2026-11-19, mirror of web/src/ai.js parseJSON) ──
def _clean_json_text(t: str) -> str:
    """One pass outside strings: drop comments, NaN/Infinity -> null, drop trailing commas."""
    out, i, n, in_str = [], 0, len(t), False
    while i < n:
        c = t[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(t[i + 1])
                i += 1
            elif c == '"':
                in_str = False
            i += 1
            continue
        prev = t[i - 1] if i else ""
        if c == '"':
            in_str = True
            out.append(c)
        elif t.startswith("//", i):
            j = t.find("\n", i)
            i = n if j < 0 else j
            out.append("\n")
            continue
        elif t.startswith("/*", i):
            j = t.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        elif not re.match(r'[\w"]', prev) and (t.startswith("-Infinity", i) or t.startswith("Infinity", i) or t.startswith("NaN", i)):
            w = 9 if t.startswith("-Infinity", i) else 8 if t.startswith("Infinity", i) else 3
            out.append("null")
            i += w
            continue
        elif c == ",":
            j = i + 1
            while j < n and t[j].isspace():
                j += 1
            if j < n and t[j] in "}]":
                i += 1
                continue
            out.append(c)
        else:
            out.append(c)
        i += 1
    return "".join(out)


def _scan(t: str, start: int):
    stack, in_str, cut, cut_stack, i = [], False, -1, None, start
    while i < len(t):
        c = t[i]
        if in_str:
            if c == "\\":
                i += 1
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c in "{[":
            stack.append(c)
        elif c in "}]":
            stack.pop()
            if not stack:
                return i, -1, None
        elif c == ",":
            cut, cut_stack = i, list(stack)
        i += 1
    return None, cut, cut_stack


def _try(s: str):
    try:
        v = json.loads(s)
        return v if isinstance(v, dict) else None
    except json.JSONDecodeError:
        return None


def _read(raw: str):
    t = _clean_json_text(raw)
    best, best_len, i = None, -1, t.find("{")
    while i >= 0:
        end, cut, stack = _scan(t, i)
        if end is None:  # never closes: the answer was cut off; rebuild from the last complete item
            if cut >= 0:
                closers = "".join("}" if b == "{" else "]" for b in reversed(stack))
                v = _try(_clean_json_text(t[i:cut] + closers))
                if v is not None and cut - i > best_len:
                    v["_truncated"] = True
                    best = v
            break
        v = _try(t[i:end + 1])
        if v is not None and end + 1 - i > best_len:
            best, best_len = v, end + 1 - i
        i = t.find("{", end + 1 if v is not None else i + 1)
    return best


def extract_json(text: str) -> dict:
    t = re.sub(r"```(?:json)?", "", (text or "").lstrip("\ufeff"), flags=re.I)
    v = _read(t)
    if v is None and re.search("[“”]", t):
        v = _read(re.sub("[“”]", '"', t))
    if v is None:
        raise LLMError("Model did not return JSON")
    return v


class BaseLLM:
    def complete(self, messages: list[dict] | str, *, web_search: bool = False, max_tokens: int = 16000) -> LLMResult:
        raise NotImplementedError

    def complete_json(self, prompt: str, *, web_search: bool = False, retries: int = 1) -> tuple[dict, list[dict]]:
        last: Exception | None = None
        for attempt in range(retries + 1):
            r = self.complete(prompt, web_search=web_search)
            try:
                return extract_json(r.text), r.sources
            except LLMError as e:
                last = e
                prompt = prompt + "\n\nIMPORTANT: Your previous answer was not valid JSON. Return ONLY the JSON object."
        raise LLMError(str(last))


class ClaudeLLM(BaseLLM):
    def __init__(self, model: str | None = None, api_key: str | None = None):
        import anthropic  # lazy import so tests don't need the key

        self.client = anthropic.Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))
        self.model = model or os.environ.get("ULTIMATUM_MODEL", "claude-sonnet-5-5")
        self.search_tool = os.environ.get("ULTIMATUM_WEB_SEARCH_TOOL", "web_search_20250305")
        self.search_uses = int(os.environ.get("ULTIMATUM_WEB_SEARCH_MAX_USES", "6"))

    def complete(self, messages, *, web_search=False, max_tokens=16000):
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        kwargs = dict(model=self.model, max_tokens=max_tokens, messages=messages)
        if web_search:
            kwargs["tools"] = [{"type": self.search_tool, "name": "web_search", "max_uses": self.search_uses}]
        try:
            resp = self.client.messages.create(**kwargs)
        except Exception as e:  # network / auth / rate limit
            raise LLMError(f"Claude API error: {e}") from e
        texts, sources = [], []
        for block in resp.content:
            btype = getattr(block, "type", "")
            if btype == "text":
                texts.append(block.text)
            elif btype == "web_search_tool_result":
                for item in getattr(block, "content", []) or []:
                    url = getattr(item, "url", None)
                    if url:
                        sources.append({"title": getattr(item, "title", "") or url, "url": url})
        # When the model searched, the JSON is in the final text block(s).
        text = "\n".join(texts)
        dedup = list({s["url"]: s for s in sources}.values())[:20]
        return LLMResult(text=text, sources=dedup, truncated=resp.stop_reason == "max_tokens")


class FakeLLM(BaseLLM):
    """Deterministic fixtures, routed by prompt markers. Good for UI work and CI."""

    def complete(self, messages, *, web_search=False, max_tokens=16000):
        from . import fixtures

        prompt = messages if isinstance(messages, str) else "\n".join(m["content"] for m in messages)
        if "UNDERSTAND THE REQUEST" in prompt:
            return LLMResult(json.dumps(fixtures.UNDERSTANDING))
        if "SOURCING PLAN" in prompt:
            return LLMResult(json.dumps(fixtures.SOURCING))
        if "TASK: RESEARCH" in prompt:
            return LLMResult(json.dumps(fixtures.MAP), [{"title": "Example source", "url": "https://example.com"}])
        if "TASK: FOLLOWUPS" in prompt:
            return LLMResult(json.dumps(fixtures.FOLLOWUPS))
        if "TASK: ESTIMATE" in prompt:
            return LLMResult(json.dumps(fixtures.ESTIMATE))
        return LLMResult("Expert answer (fake LLM): leather is ~45–55% of a formal shoe's material cost; reduce cutting waste with nesting software.")


def get_llm() -> BaseLLM:
    kind = os.environ.get("ULTIMATUM_LLM", "claude").lower()
    if kind == "fake":
        return FakeLLM()
    return ClaudeLLM()


def web_search_enabled() -> bool:
    return os.environ.get("ULTIMATUM_WEB_SEARCH", "1") not in ("0", "false", "no")
