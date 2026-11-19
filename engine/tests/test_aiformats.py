"""Bug sweep 2026-11-19: real model output comes in many shapes. Same cases as web/tests/aiformats.test.js."""
import json
import pathlib

import pytest

from ultimatum.llm import LLMError, extract_json

CASES = json.loads((pathlib.Path(__file__).resolve().parents[2] / "web/tests/fixtures/ai_output_formats.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("c", CASES, ids=[c["name"] for c in CASES])
def test_reads_real_ai_output(c):
    if c.get("error"):
        with pytest.raises(LLMError):
            extract_json(c["text"])
        return
    v = extract_json(c["text"])
    for k, want in c["expect"].items():
        assert v[k] == want
    for k, n in c.get("expect_len", {}).items():
        assert len(v[k]) == n
    assert bool(v.get("_truncated")) == ("truncated" in c["name"])
