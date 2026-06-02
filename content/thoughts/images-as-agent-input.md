---
title: Images as Agent Input — Why Visual Context Changes the Game
summary: A case for adding image upload and paste support to FleetCrown's agent interface, and what it would take to do it right.
excerpt: An image of a broken UI tells the agent more than a paragraph of text. Adding visual input to the agent command surface is the next natural step for builders who think visually.
publishedAt: 2026-05-09
tags: agents,control,ux,product
featured: false
author: Ivy
readingTimeMin: 6
---
## The Gap in the Current Interface

The current agent interface in FleetCrown accepts text. Prompts, queue items, custom instructions — all text.

That's fine when the work is purely textual: fix a bug, write a function, add a field. But a lot of real builder work is visual. A screenshot of a broken layout. A Figma mockup of what it should look like. A photo of a whiteboard sketch. A cursor or VS Code screenshot showing an error state.

Right now, a builder working from a visual source has to translate that image into words before they can give it to an agent. That translation step is lossy. "The card on the right is too tall and the text wraps weird" is worse than pointing at the card.

## Why This Matters for Agent Accuracy

Modern AI models are natively multimodal. Claude, GPT-4o, Gemini — all of them accept images alongside text. When you send an image with your prompt, the model can reason about it directly: identify layout issues, read text from screenshots, compare a design mockup to code, spot the mismatch between what the design shows and what the implementation renders.

Text descriptions of visual problems carry ambiguity. Images remove it. An agent given a screenshot of a broken component and asked "fix this" has a much clearer ground truth than one given "the card looks off on mobile."

This is not a marginal improvement. For UI work specifically, it's a qualitative leap in the quality of agent instruction.

## What "Image Input" Would Look Like in FleetCrown

The implementation surface is the agent command interface — the same place where prompts are typed and queue items are added.

Two input modes are needed:

**Drag and drop / file picker** — the explicit path. The user opens a file dialog or drops an image file. This covers screenshots saved to disk, design exports, exported mockups.

**Paste from clipboard** — the fast path. The user takes a screenshot (Cmd+Shift+4 on Mac, PrtSc on Linux) and pastes it directly into the prompt area. No file, no drag. This is how modern editors like Cursor, Linear, and Notion handle image input, and it's the expected UX.

Both paths should produce the same result: the image is attached to the outgoing prompt and sent to the agent alongside the text.

## The Implementation Sketch

On the frontend, the prompt input needs:

- A `paste` event handler that detects `image/*` items in `ClipboardEvent.clipboardData.items`
- A `dragover` / `drop` handler for file drops
- A small image preview strip below the textarea showing attached images (with an × to remove)
- The image count and presence reflected in the "Send" button state

On the API side:

- The inject endpoint currently accepts text. It needs to accept an `images` array of base64 strings or URLs alongside the `prompt` text
- The downstream agent call (Claude Code, CLI, or API) needs to forward those images to the model

The wire format question is the main technical decision. Claude Code (the CLI) currently accepts images via special syntax in some contexts. The Anthropic Messages API accepts image blocks in the `content` array. If FleetCrown is injecting prompts into terminal sessions (via zellij/bash hooks), there's a harder translation problem — terminals don't natively carry images. If it's calling the API directly, images are first-class.

## Where the Complexity Lives

The straightforward case is an API-mode agent: send `{ role: "user", content: [{ type: "image_url", ... }, { type: "text", ... }] }` and the model gets both. Clean.

The harder case is terminal injection. When FleetCrown sends a prompt to a running Claude Code session in a zellij pane, it types text into the terminal. Images don't type. The workarounds are: (a) save the image to a temp file and include the path in the prompt, (b) embed the image as base64 in the prompt and tell the agent to read it, (c) add an attachment API to Claude Code itself.

Option (a) — temp file + path — is the most practical and already works today. The agent can read files. The prompt becomes "please look at /tmp/cockpit-screenshot-1234.png and fix the layout issue shown." The agent opens the file, sees the image, and acts.

This means the minimum viable version is:
1. Accept image paste/drop in the prompt input
2. Save images to temp files before sending
3. Append the file path(s) to the prompt text automatically

No API changes needed. No new agent capabilities. Just filesystem mediation.

## Why Not Ship It Now

Three reasons to think before building:

**Storage and cleanup.** Temp files accumulate. A multi-project builder could generate a lot of them. A cleanup strategy (time-based, session-based) is required.

**Size limits.** High-resolution screenshots can be several MB. Models have image size limits and the input may need resizing/compression before sending.

**Scope creep risk.** Image upload is a feature users will immediately want more of: image history, re-attachment, multi-image prompts, video frames. The MVP needs a clear boundary.

The right time to build this is when the core agent loop (text in, code out, review, iterate) is stable and the bottleneck clearly shifts to "I need to show the agent what I mean."

We're not far from that point.

## What to Build First

A proof of concept worth 200 lines: paste handler + temp file write + path injection into the prompt. No UI preview, no drag-and-drop, no history. Just: paste an image, it gets saved, the path appears in your prompt, you send it.

If that unlocks better agent output on visual tasks, the UI investment is justified. Build the proof of concept, measure whether agents actually produce better results with image context, then invest in the full input experience.

This is the FleetCrown way: ship the minimal version, measure real impact, then build what the data justifies.
