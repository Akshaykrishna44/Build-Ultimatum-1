"""Load test: N simultaneous users run the whole flow against a running server.
    ULTIMATUM_LLM=fake uvicorn ultimatum.api:app --port 8765 --workers 1 &
    python scripts/load_test.py --url http://127.0.0.1:8765 --users 50 --rounds 3
With the fake AI this measures the engine itself (routing, storage, calculation, exports), not the AI's speed."""
from __future__ import annotations

import argparse
import statistics
import threading
import time
from collections import Counter

import httpx


def user_flow(base: str, i: int, results: list, codes: Counter, errors: list):
    with httpx.Client(base_url=base, timeout=60) as c:
        try:
            t0 = time.perf_counter()
            steps = []

            def call(method, path, **kw):
                s = time.perf_counter()
                r = c.request(method, path, **kw)
                steps.append((path.split("/")[2] if path.count("/") > 1 else path, time.perf_counter() - s))
                codes[r.status_code] += 1
                if r.status_code >= 400:
                    errors.append(f"user {i} {method} {path} -> {r.status_code} {r.text[:120]}")
                return r

            call("POST", "/v1/understand", json={"text": f"need {100 + i} t shirts for an event"})
            p = call("POST", "/v1/projects", json={"request": {"product": f"leather shoes batch {i}"}}).json()
            pid = p["id"]
            call("PUT", f"/v1/projects/{pid}/answers", json={"answers": {"order_qty": 1000 + i, "market_location": "Agra"}})
            call("POST", f"/v1/projects/{pid}/estimate")
            call("POST", "/v1/chat", json={"project_id": pid, "messages": [{"role": "user", "content": "Which leather is best?"}]})
            call("GET", f"/v1/projects/{pid}")
            call("GET", f"/v1/projects/{pid}/export/bom.csv")
            call("POST", "/v1/sourcing", json={"text": "t shirts", "qty": 200})
            results.append((time.perf_counter() - t0, steps))
        except Exception as e:  # noqa: BLE001
            errors.append(f"user {i}: {type(e).__name__}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8765")
    ap.add_argument("--users", type=int, default=50)
    ap.add_argument("--rounds", type=int, default=3)
    a = ap.parse_args()
    results, codes, errors = [], Counter(), []
    t0 = time.perf_counter()
    for r in range(a.rounds):
        ts = [threading.Thread(target=user_flow, args=(a.url, r * a.users + i, results, codes, errors)) for i in range(a.users)]
        [t.start() for t in ts]
        [t.join() for t in ts]
    wall = time.perf_counter() - t0
    flows = sorted(x[0] for x in results)
    per_step = {}
    for _, steps in results:
        for name, d in steps:
            per_step.setdefault(name, []).append(d)
    print(f"users={a.users} x rounds={a.rounds}: {len(results)} complete flows in {wall:.1f}s, {sum(codes.values())} requests")
    print("status codes:", dict(codes))
    if flows:
        print(f"whole flow  p50 {statistics.median(flows):.2f}s  p95 {flows[int(len(flows) * .95) - 1]:.2f}s  max {flows[-1]:.2f}s")
    for k, v in per_step.items():
        v.sort()
        print(f"  {k:12} p50 {statistics.median(v) * 1000:7.0f} ms   p95 {v[int(len(v) * .95) - 1] * 1000:7.0f} ms")
    print("errors:", len(errors))
    for e in errors[:10]:
        print("  ", e)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
