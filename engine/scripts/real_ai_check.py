"""Real-AI check: runs typical requests through the real Claude API and checks the answers.

The automated tests use scripted AI answers. This script is the missing piece: it shows how the REAL model
answers the understanding step and the research step (questions + raw materials) for typical requests.

Run on your own computer (your key stays in your environment, never in the code or the chat):
    cd engine
    pip install -e .
    export ANTHROPIC_API_KEY=...            # Windows PowerShell:  $env:ANTHROPIC_API_KEY="..."
    python scripts/real_ai_check.py          # add --research to also run the research step (slower, costs more)

Cost: about 10 short calls (understanding only), or about 20 with --research.
"""
from __future__ import annotations

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ultimatum import understand as und  # noqa: E402
from ultimatum.engine import UltimatumEngine  # noqa: E402
from ultimatum.llm import extract_json, get_llm  # noqa: E402
from ultimatum.schemas import ProjectRequest  # noqa: E402
from ultimatum.store import Store  # noqa: E402

# (request, acceptable intents, should open the engineered building engine?)
CASES = [
    ("500 ICU ventilators", {"make_manufacture", "estimate_cost", "plan_project"}, False),
    ("need t shirts for an event", {"buy_source", "plan_project"}, False),
    ("i have planned to build a hindu temple", {"build_construct", "plan_project"}, False),
    ("mobile manufacturing", {"make_manufacture", "plan_project", "estimate_cost"}, False),
    ("rice farming 10 acres", {"plan_project", "make_manufacture", "estimate_cost"}, False),
    ("PEB warehouse 80 × 40 m", {"build_construct"}, True),
    ("best cement for a house?", {"question"}, False),
    ("எனக்கு 200 டி-ஷர்ட் வேண்டும்", {"buy_source", "plan_project", "make_manufacture"}, False),
    ("cost of a 2 floor house in Coimbatore", {"build_construct", "estimate_cost"}, True),
    ("asdkj", {"unclear"}, False),
]


def main(research: bool) -> int:
    if os.environ.get("ULTIMATUM_LLM", "claude") != "fake" and not os.environ.get("ANTHROPIC_API_KEY"):
        print("Set ANTHROPIC_API_KEY first (see the top of this file).")
        return 2
    llm = get_llm()
    fails = 0
    print(f"{'request':42} {'intent':18} {'ok':4} {'qs':3} {'paths':28} summary")
    for text, ok_intents, building in CASES:
        t0 = time.time()
        if und.is_meaningless(text)["meaningless"]:
            u = und.parse_understanding({"intent": "unclear"})
        else:
            u = und.parse_understanding(extract_json(llm.complete(und.understand_prompt(text), max_tokens=1500).text), text)
        good = u["intent"] in ok_intents
        if building and u["intent"] == "build_construct" and u.get("building_type") in ("", "other"):
            good = False  # a supported building should be typed (house / warehouse / ...)
        fails += 0 if good else 1
        print(f"{text[:42]:42} {u['intent']:18} {'yes' if good else 'NO':4} {len(u['questions']):<3} "
              f"{','.join(p['id'] for p in u['paths'])[:28]:28} {u['summary'][:70]}  ({time.time() - t0:.1f}s)")
    if research:
        print("\nResearch step (questions + raw materials):")
        eng = UltimatumEngine(llm=llm, store=Store(os.path.join(tempfile.mkdtemp(), "check.db")))
        for text in ("need t shirts for an event", "i have planned to build a hindu temple", "mobile manufacturing"):
            p = eng.create_project(ProjectRequest(product=text), reuse_knowledge=False)
            m = p.map
            qs = sum(len(s.questions) for s in m.stages)
            mats = m.raw_materials
            in_india = sum(1 for r in mats if r.get("india_sources"))
            ok = qs >= 8 and len(mats) >= 5 and in_india >= len(mats) - 1
            fails += 0 if ok else 1
            print(f"- {text}: {len(m.stages)} stages, {qs} questions, {len(mats)} raw materials ({in_india} with Indian sources) "
                  f"{'ok' if ok else 'CHECK'}")
            for r in mats[:4]:
                print(f"    {r['material']}: {', '.join(r['india_sources'][:2])} {r['typical_price']}"
                      f"{'  [imported from ' + r['origin'] + ']' if r['imported'] else ''}")
    print(f"\n{'All checks passed.' if not fails else f'{fails} check(s) need a look: send the lines marked NO / CHECK.'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main("--research" in sys.argv))
