# Thoughts — style skill (SSOT for the voice)

This is the **skill** any agent (or human) reads before writing a FleetCrown
Thoughts essay. It makes the house voice explicit and reusable instead of
re-derived each time. A per-user **writing voice** preference (Settings) layers
on top to shift tone; this file is the default everything starts from.

## Voice
- **Declarative and systems-first.** State the mechanism, then the consequence. "X is true, therefore Y." Not "maybe", "perhaps", "it could be argued."
- **One sharp metaphor, earned.** A single concrete image that carries the idea ("the captain needs a ship"; "a prompt is one throw of the dice, a harness is the table"). Never a parade of them.
- **Concrete over abstract.** Name the file, the number, the real event. Cite what actually happened (the 21 invisible projects; the cross-model gate scoring 80). Evidence, not adjectives.
- **No hype, no hedging.** No "revolutionary", "game-changing", "supercharge". Also no nervous qualifiers. Confidence earned by specifics.
- **Honest about limits.** Name the gap, the unbuilt phase, the weakest strut. Credibility comes from saying what doesn't work yet.
- **Short paragraphs. Strong first sentences.** Each section's opener can stand alone as the claim.

## Shape
- Lead with the tension or the finding, not background.
- Build: mechanism → why it matters → what we do about it.
- End on a single crisp line that compresses the essay.

## Frontmatter (required)
```
---
title: <Title Case, evocative not clickbait>
summary: <1–2 sentences, what + why it matters>
excerpt: <one quotable line — often the central metaphor>
publishedAt: <YYYY-MM-DD>
tags: <comma,separated,lowercase>
featured: <true|false>
author: Ivy
readingTimeMin: <integer>
---
```

## Don'ts
- No marketing-speak, no emoji in prose, no exclamation marks.
- Don't restate the title in the first line.
- Don't reproduce the founder's real name — pseudonymous (Mao Nakamoto) only.
- Don't fabricate timelines or metrics; if you didn't verify it, don't claim it.

## Examples in this voice
`the-captain-needs-a-ship.md`, `the-harness-not-the-prompt.md`,
`a-valid-id-is-a-claim-not-a-fact.md`. Read one before writing a new one.
