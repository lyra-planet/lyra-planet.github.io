---
title: "GalForge: a visual novel from one sentence"
date: 2026-11-01
slug: galforge
lede: "GalForge is an Agent Skill. Ask your coding agent for a game in one line, and it writes, draws, scores and tests a branching visual novel that runs in the browser. This is the game it made from a one-line request, and how it checks its own work."
tags: [agent-skill, generative, ai-native]
---

<figure><img src="/img/galforge/banner.webp" alt="The GalForge title screen: a pixel-art night scene with the title in the middle" width="1600" height="900"></figure>

GalForge is an [Agent Skill](https://agentskills.io/), a folder of instructions and tools that a coding agent reads when the task calls for it. Ask for a visual novel and the agent designs it, writes the script, draws every sprite and background, composes the music, plays the game through to every ending, and hands back a folder you open in a browser. It works with Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot and OpenCode.

There are no image assets anywhere in the pipeline, and no image-generation model. Every picture is drawn by code the agent writes.

## What one sentence produced

The whole request was 「写一个辐射主题的」, "write one about radiation". The agent came back with *Dose Margin* (《余量》).

It is one night in the 1990s at a research reactor by the sea, the night something goes wrong. You are the dosimetrist on the night shift, and you keep a ledger of how much radiation each person can still take. Every job inside the high-dose zone needs someone to go in, and whoever goes spends their own margin. Before dawn you have to write everyone's number into the logbook and report it to the director.

<div class="play" data-src="/galforge/">
  <img src="/img/galforge/choice.webp" alt="Dose Margin: a choice under the red alarm light" width="960" height="540">
  <button type="button">Play Dose Margin here</button>
</div>
<p class="play-note">Runs in this page. <a href="/galforge/">Open it on its own page ↗</a></p>

It has 4 chapters, 6 endings, 25 choice points, 1,064 lines, 3 CGs and 5 music tracks, and a first playthrough takes 40 to 50 minutes. The whole game, engine and art and music and script, is 454 KB.

<figure><img src="/img/galforge/airlock.webp" alt="The airlock corridor: three people changing into protective suits" width="960" height="540"><img src="/img/galforge/trench.webp" alt="The pipe trench: standing water and red pipes" width="960" height="540"></figure>

## Every pixel is code

<figure><img src="/img/galforge/character.webp" alt="One character in 10 expressions and 14 poses" width="1600" height="438"></figure>

That is one character in 10 expressions and 14 poses. Hair, face, clothes and how the hands are held are all parameters: change a few numbers and you have a different person, and the same person looks the same in a hundred shots. A new outfit or a pair of glasses is a one-line edit. In a scene she blinks and breathes, and her mouth moves while she talks.

The engine also computes lighting, weather, screen shake and transitions. When the PA announces a level-two water alarm in *Dose Margin*, the room's light shifts from the warm yellow of a desk lamp to alarm red. Music and ambience are synthesized live in the browser with WebAudio. One track loops every seven beats, and the clicks of the Geiger counter are synthesized too.

## Checking a branching story before anyone plays it

A game with many endings fails in two ways: an ending nobody can reach, or a path that leads nowhere. So the skill ships ten tools, and a game has to pass them before it is handed over. This is the ending solver on *Dose Margin*:

```console
$ node tools/solve.js --endings
✓ E1《满水》  到达时 me=6 zheng=0 kuang=3 fang=2
✓ E2《余量》  到达时 me=10 zheng=0 kuang=0 fang=2
✓ E3《记录》  到达时 me=8 zheng=13 kuang=2 fang=1
✓ E4《改写》  到达时 me=1 zheng=1 kuang=4 fang=3
✓ E5《空池》  到达时 me=1 zheng=1 kuang=2 fang=1
✓ E6《交班》  到达时 me=1 zheng=1 kuang=4 fang=3
✓ 没有死路：每个到达的状态都至少有一个选项或出口

搜索了 2617676 个状态
```

It searched 2,617,676 game states, reached all six endings and found no dead ends. The other checks on the same game:

- **Script validator:** 0 errors. It checks structure, references, reachability, that every flag read has a write, timers, text markup, pacing and a list of clichés.
- **40,000 random playthroughs:** every ending gets hit, the rarest in 2.3% of runs.
- **The real engine, run headless:** no hangs or crashes, all 96 story nodes visited, and the shortest route to each of the six endings played through.
- **Independent review:** one reviewer agent per chapter found 23 serious and 71 minor problems, all fixed.
- **A real browser:** a full playthrough at desktop and phone widths, and none of the 25 buttons is smaller than 44 pixels.

## Not the same game twice

A language model picks the most likely option at every step, so stories written by AI drift toward the same places: a countdown as the hook, a confession on a rooftop at sunset, the robot who learns to feel. GalForge works against that in three places. Its documents contain no plot, character or dialogue examples; format examples use placeholders. Concepts start as six candidates grown from six different starting points, and the drafts are checked against a cliché list afterwards, so every hit needs a reason to stay. And each finished game leaves a one-line fingerprint of its structure, cast, art and sound, which the next game is compared against before work starts.

*Dose Margin* has no romance route at all. The skill handles romance, mystery, time loops, slice of life and adventure, with structures from a common route that splits into character routes to a single route with many endings.

## How a game gets made

1. **Concept.** Six candidates, then the cliché check, then the fingerprint comparison; you pick from three.
2. **Structure and cast,** ending with a first draft of the whole script.
3. **Art and music,** all written as code.
4. **The first chapter,** written by the main agent, which also sets the numbers and thresholds the branches depend on.
5. **The other chapters,** written in parallel by subagents that follow the first one.
6. **Review,** one independent reader per chapter.
7. **Tests,** in layers, from the script validator to the real browser.

The engine is plain HTML and JavaScript, with no framework and no build step. It handles stats, flags, clues, branches, timed choices, saves, skip, auto-play, a backlog and a settings page. The script is data the engine reads, which is what lets several agents write chapters at the same time.

Before starting, the agent asks everything it needs in one go: genre, the characters' ages and content notes, art style, whether to add voices, and where to put the game. What comes back is a static folder. It can go on GitHub Pages or any static host, or be zipped for itch.io; Steam needs a desktop wrapper such as NW.js or Electron. The title screen always states that the script was written by AI, which Steam and Chinese platforms require.

## Try it

```bash
npx skills add lyra-planet/galforge
```

Or clone it into your agent's skill folder:

```bash
# Claude Code
git clone https://github.com/lyra-planet/galforge ~/.claude/skills/galforge

# Codex, Cursor, Gemini CLI, OpenCode, GitHub Copilot and others
git clone https://github.com/lyra-planet/galforge ~/.agents/skills/galforge
```

It needs Node 18 or newer. The real-browser tests need Python Playwright, and voice acting, which is optional, works with any command-line TTS. Then ask for what you want: "make a galgame", "a mystery visual novel with three endings, about forty minutes", or just "write one about radiation".

The code is on [GitHub](https://github.com/lyra-planet/galforge) under the MIT license.
