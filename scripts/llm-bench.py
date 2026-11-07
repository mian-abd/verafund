#!/usr/bin/env python3
"""Benchmarks a local Ollama model the way Vera uses it.

Reports decode speed (tokens/s), prompt processing speed, load time, and whether the
model picks the right tool for a spoken request. Standard library only, so it runs on
a fresh Jetson.

  python3 scripts/llm-bench.py [model] [ollama_url]
"""

import json
import statistics
import subprocess
import sys
import time
import urllib.request

MODEL = sys.argv[1] if len(sys.argv) > 1 else "qwen2.5:3b"
URL = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:11434").rstrip("/")

PROMPTS = [
    "In two sentences, explain why a virtual card with a price cap protects me from subscription price hikes.",
    "My Netflix went from $15.99 to $18.99. Should I approve it if my streaming budget is $40 a month? Answer briefly.",
    "Summarize: I spent $412 on food, $96 on subscriptions and $1,250 on rent this month. Income was $2,400.",
]

TOOLS = [
    {"type": "function", "function": {"name": "cancel_subscription", "description": "Close the card for a subscription so it can't charge again",
        "parameters": {"type": "object", "properties": {"merchant": {"type": "string"}}, "required": ["merchant"]}}},
    {"type": "function", "function": {"name": "set_budget", "description": "Set a monthly budget for a spending category",
        "parameters": {"type": "object", "properties": {"category": {"type": "string"}, "monthly_limit_dollars": {"type": "number"}},
                       "required": ["category", "monthly_limit_dollars"]}}},
    {"type": "function", "function": {"name": "add_to_goal", "description": "Move money into a savings goal",
        "parameters": {"type": "object", "properties": {"goal_name": {"type": "string"}, "dollars": {"type": "number"}},
                       "required": ["goal_name", "dollars"]}}},
]

TOOL_CASES = [
    ("Vera, please cancel my Netflix, I never watch it", "cancel_subscription", {"merchant": "netflix"}),
    ("set my food budget to 300 dollars a month", "set_budget", {"category": "food", "monthly_limit_dollars": 300}),
    ("put 50 bucks into my laptop fund", "add_to_goal", {"goal_name": "laptop", "dollars": 50}),
]


def post(path, body, timeout=300):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def ns_rate(count, duration_ns):
    return count / (duration_ns / 1e9) if duration_ns else 0.0


def start_tegrastats():
    try:
        return subprocess.Popen(["tegrastats", "--interval", "500"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    except FileNotFoundError:
        return None


def read_tegrastats(proc):
    if not proc:
        return None
    proc.terminate()
    out, _ = proc.communicate(timeout=5)
    gpu, power = [], []
    for line in out.splitlines():
        parts = line.split()
        for i, p in enumerate(parts):
            if p == "GR3D_FREQ" and i + 1 < len(parts):
                gpu.append(int(parts[i + 1].split("%")[0]))
            if p == "VDD_IN" and i + 1 < len(parts):
                power.append(int(parts[i + 1].split("mW")[0]))
    if not gpu:
        return None
    return {"gpu_util_avg_pct": round(statistics.mean(gpu)), "power_avg_w": round(statistics.mean(power) / 1000, 1) if power else None}


def main():
    print(f"model {MODEL} at {URL}")
    # Cold load (unload first so the number is honest).
    post("/api/generate", {"model": MODEL, "keep_alive": 0}, timeout=60)
    t0 = time.time()
    r = post("/api/generate", {"model": MODEL, "prompt": "hi", "stream": False, "options": {"num_predict": 1}})
    print(f"cold load: {r.get('load_duration', 0) / 1e9:.1f}s (wall {time.time() - t0:.1f}s)")

    tegra = start_tegrastats()
    decode, prefill = [], []
    for prompt in PROMPTS:
        for _ in range(2):
            r = post("/api/generate", {"model": MODEL, "prompt": prompt, "stream": False,
                                        "options": {"num_predict": 160, "temperature": 0}})
            decode.append(ns_rate(r["eval_count"], r["eval_duration"]))
            if r.get("prompt_eval_duration"):
                prefill.append(ns_rate(r["prompt_eval_count"], r["prompt_eval_duration"]))
    stats = read_tegrastats(tegra)

    print(f"decode: {statistics.mean(decode):.1f} tok/s (min {min(decode):.1f}, max {max(decode):.1f}, n={len(decode)})")
    if prefill:
        print(f"prompt: {statistics.mean(prefill):.0f} tok/s")
    if stats:
        print(f"during generation: GPU {stats['gpu_util_avg_pct']}% avg, board power {stats['power_avg_w']} W avg")

    correct = 0
    for text, want_tool, want_args in TOOL_CASES:
        t0 = time.time()
        try:
            r = post("/api/chat", {"model": MODEL, "stream": False, "tools": TOOLS, "options": {"temperature": 0},
                                   "messages": [{"role": "system", "content": "You are Vera, a money assistant. Call exactly one tool."},
                                                {"role": "user", "content": text}]})
        except Exception as err:  # noqa: BLE001
            print(f"tools: {text!r} -> error {err}")
            continue
        calls = r.get("message", {}).get("tool_calls") or []
        got = calls[0]["function"] if calls else None
        ok = bool(got) and got["name"] == want_tool and all(
            str(v).lower() in str(got["arguments"].get(k, "")).lower() for k, v in want_args.items())
        correct += ok
        print(f"tools: {text!r} -> {json.dumps(got) if got else 'no tool call'} {'OK' if ok else 'WRONG'} ({time.time() - t0:.1f}s)")
    print(f"tool choice: {correct}/{len(TOOL_CASES)} correct")


if __name__ == "__main__":
    main()
