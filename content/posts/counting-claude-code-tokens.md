---
title: "How I count my Claude Code tokens"
date: 2026-10-28
slug: counting-claude-code-tokens
lede: "Summing every usage field in the session logs gives a number that is wrong in both directions. Here is what I count instead, and how close it lands to ccusage."
tags: [claude-code, tooling, ai-native]
---

My GitHub profile shows how many tokens my coding agents have used. Getting that number right took more care than I expected: the session logs record usage in ways that are easy to count twice, and occasionally not at all.

## Where the numbers live

Claude Code writes one JSONL file per session. Every assistant message carries a `usage` object with four counters: input tokens, output tokens, tokens written to the prompt cache, and tokens read from it. A day's total is the sum of those four counters over that day's API responses. The hard part is deciding what counts as one response.

## Three ways the naive sum goes wrong

### One response, several lines

A response that contains thinking, some text and a tool call is logged as several lines, and every line repeats the same `usage`. Summing lines counts that response three times.

### Forks copy history

Forking or resuming a session copies earlier messages into the new file. In my logs, 63,791 unique responses were spread over more than 150,000 lines.

### Zeros that are not zero

Some newer entries have all four top-level counters at zero, while the real numbers sit in `usage.iterations`. A naive sum misses them entirely.

## What I count

- A response is `message.id` + `requestId`. It is counted once, however many lines or files it shows up in. Entries missing either id are not deduplicated, which is what ccusage does too.
- The value is the top-level counters, or the sum over `iterations` when the top level is all zeros. Across duplicates I keep the maximum of each field, because a fork's copy can carry zeros while the original carries the real numbers.
- Days are cut in Beijing time, and `<synthetic>` messages are skipped because no API call happened.

```python
def usage_of(u):
    top = [u.get(k) or 0 for k in FIELDS]
    if any(top):
        return top
    its = u.get("iterations") or []
    return [sum(it.get(k) or 0 for it in its) for k in FIELDS]
```

## Checking against ccusage

[ccusage](https://github.com/ryoppippi/ccusage) is the usual tool for this, so I copied one project directory (84 files, six days) and ran both on the same data. Five of the six days matched field for field. On the sixth, my count was 965,874 tokens higher, or 0.099%. The whole gap sits in responses whose top-level counters were zero in one copy. I could not reproduce exactly which copy ccusage picks; mine keeps the copy with numbers, which is what the API actually reported for that call.

## What nine days look like

Through October 28 the counter shows about 18.4 billion tokens across 65,329 API calls and 175 sessions. 97.75% of those tokens are cache reads: the agent rereading its own context, cheaply. The code and prose the model actually wrote, its output tokens, come to 73 million, or 0.4% of the total.

## Publishing it

A cron job on my dev machine runs the counter twice a day, renders the card on my profile and commits only the daily totals: no prompts, no code, no project names. Each file is cached by size and modification time, so after the first full scan (a little under two minutes) a run takes about a second.
