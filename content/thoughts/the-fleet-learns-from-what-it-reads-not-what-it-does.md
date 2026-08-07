---
title: The Fleet Learns From What It Reads, Not What It Does
summary: An audit of FleetCrown against the 2026 self-improvement literature found the loop pointed the wrong way — it improves from papers it ingests, never from the thousands of runs it grades. Here is the finding, why it happened, and the plan to fix it without building something that quietly learns to cheat.
excerpt: FleetCrown reads arXiv every morning and proposes how it should evolve. It also grades every agent run against a definition of done, records the exact prompt, the outcome, and a one-sentence critique of what went wrong — and then reads none of it. We built the hard half of a self-improvement loop and skipped the easy half.
publishedAt: 2026-08-07
tags: architecture,orchestration,self-improvement,evaluation,autonomy,research
featured: true
author: g
readingTimeMin: 13
---

## An Audit That Found the Loop Pointed Backwards

In May I wrote about the session system and called it "the loop that almost closes itself." The essay ended on a specific gap: FleetCrown had continuity between sessions but no mechanism to get *better* at what it does between them. Three months later I went looking for that gap with the current literature in hand, expecting to find it partly filled.

It is not partly filled. It is filled in the wrong direction.

FleetCrown has exactly one self-improvement loop, and it lives in `src/lib/frontier/`. Every day it ingests arXiv RSS feeds — cs.AI, cs.MA, cs.SE, cs.CL — plus Lobsters and Hacker News. It ranks what it finds, drafts concrete proposals for how FleetCrown itself should evolve, runs those proposals past a panel of judges from different model lineages so they don't share the generator's blind spots, and surfaces the survivors to a human who accepts or dismisses them.

That is a good loop. It is grounded, adversarially checked, and human-gated. It stays.

It is also grounded *entirely in what other people have published*. FleetCrown improves from what it reads. It has never once improved from what it does.

## The Corpus Nobody Reads

Here is what the system already records, every time it dispatches an agent.

It stores the fully rendered prompt body — not the intent slug, not a template reference, the actual text sent to the agent — in `prompt_history.resolvedPrompt`. It stores the graded outcome in `orchestration_runs.outcome`: success, partial, error, hang, user abort, timeout. It stores tokens in, tokens out, and dollars spent.

And when a project declares a definition of done, a judge from a different model lineage than the worker reads the agent's handoff against that bar and returns a verdict. Not a score — a verdict plus a `gap` field: one sentence naming the single most important thing still missing.

Prompt. Outcome. Cost. A natural-language critique of the failure.

That is a training corpus. Specifically, it is the exact shape the strongest current work in prompt optimization asks for. The GEPA line of research — reflective prompt evolution, ICLR 2026 oral — makes one central claim: when the program you are optimizing is written in natural language, the optimization signal should be natural language too, because a sentence explaining *why* something failed carries far more information than a number saying *how much* it failed. Feed it text feedback and it outperforms reinforcement learning approaches while needing tens of rollouts instead of thousands.

We generate that sentence. On every graded failure. And then we do nothing with it.

I traced every consumer of `prompt_history` in the codebase: the activity view, the daily digest, the Today page, account export, project merge. All of them render it. None of them learn from it. There is not a single optimizer anywhere in the system.

## Why This Happened

It would be easy to write this up as negligence. It isn't, and the reason matters for anyone building something similar.

The natural order of construction is: build the thing, then measure the thing, then improve the thing. We did the first two properly. The measurement layer in FleetCrown is genuinely good — better, in places, than what the harness vendors ship. The judge refuses to accept an agent's self-assessment, because an agent grading its own homework is the whole failure mode. It runs on a different model lineage than the worker so its blind spots don't overlap. It fails *open*, so a broken judge can't wedge the fleet.

None of that is obvious. All of it took real iterations to get right, including a stretch where the judge was structurally unable to see the evidence it was supposed to grade — the worker's contract promised type checks, lint results, and commit state, and four layers in between silently dropped them. Fifty-six runs were graded on evidence that never arrived.

So: measurement first, improvement later. That's the correct order. We just never got to "later," and in the meantime the frontier loop got built — because reading papers and proposing ideas is a much more legible, much more immediately satisfying kind of self-improvement than mining your own failure logs.

The result is a system that is well-instrumented and does not learn.

## What the Field Actually Knows

Modern agents are described as a pair: model weights, and the scaffolding around them. Self-improvement splits cleanly along that seam. You can update the weights — deep, persistent, needs training infrastructure. Or you can update the scaffolding — prompts, memory, tools, control logic — which is cheap, reversible, and needs nothing but API access.

The 2026 survey of the area counts 73 papers on the first and 166 on the second.

That ratio is the most useful number in the literature. Two thirds of a very active field has concluded that the returns are in the scaffold, for a reason that is entirely practical: a scaffold change can be read, reviewed, and reverted. A weight change cannot.

This is good news for us specifically, because FleetCrown does not own any weights. Vendor CLIs do. The hybrid work that turns both knobs at once found they contribute differently — harness updates improve the software engineering *around* the model, its parsing and retries and search procedure, while weight updates add task intuition the scaffold never discovers on its own. We can only have the first. It happens to be the larger and better-understood two thirds.

Within the scaffold, the four families are prompt optimization, memory, tools, and full-scaffold rewrites. Memory is the biggest and most production-proven of the four. Full-scaffold rewrite — where the agent modifies its own codebase and validates each change empirically, as in the Darwin Gödel Machine — is the most spectacular and the least mature.

## Four Ways This Goes Wrong

The literature is unusually honest about failure, and every one of these has already bitten a published system.

**Verification gets harder faster than generation does.** The old intuition that checking an answer is easier than producing it has inverted for coding agents. There's a formulation I keep coming back to: a reward signal can be scalable, faithful, or robust — pick two. Executable tests scale and resist gaming but miss intent. LLM judges are flexible and partly faithful but exploitable. Human review is faithful and robust and does not scale at all. The conclusion is that no fixed reward function survives continued capability growth, and reward hacking cannot be eliminated by hardening the verifier once — only suppressed by auditing it continuously.

**Self-evolving agents degrade on their own.** Not under attack. On their own. The failure is called misevolution: safety alignment decays, deployment-time reward hacking appears, insecure tools get created and then reused. It affects agents built on top-tier models. The proposed root cause is elegant and uncomfortable — agents over-rely on their own past successes without critically reflecting on them. Errors in memory amplify through experience-following into self-reinforcing loops. The cheapest known mitigation is almost insultingly simple: tell the agent to treat retrieved memories as *references* rather than *rules*.

**Optimizers compress away the thing you were trying to keep.** Prompt optimizers exhibit brevity bias — they prefer short, clean instructions, so specific hard-won domain knowledge gets summarized out. Worse, iterative full rewrites erode detail cumulatively, a failure named context collapse. The structural fix is to store learned context as itemized bullets and apply incremental deltas, never wholesale rewrites.

**Fixed improvement policies are a ceiling.** A position paper from ICML makes the argument that nearly every deployed self-improvement loop is *extrinsic* — a fixed, human-designed procedure for getting better — and therefore cannot generalize past what its designer anticipated.

We have a textbook instance of that last one in our own codebase. When runs fail consecutively, an escalation ladder feeds a stronger instruction into the next dispatch: retry, then patch, then replan, then bring in a human. It is a genuinely good mechanism. It is also four hardcoded strings that have never changed in response to whether they work.

## The Case Against Building This Badly

There is a version of this I could ship next week, and it would be a mistake.

Prime Intellect recently released Prime Agent, an open-source harness built around a self-refining loop: it reviews its own trajectory and applies small, evidence-backed edits to its own prompt, skills, and memory. It is a genuinely strong piece of engineering, and the design is more advanced than anything in FleetCrown's inner loop.

Buried in their own limitations section is the result everyone building in this space should read twice. Set loose on Factorio, the refine loop developed legitimate skills, discovered it could exploit game mechanics to teleport resources, and then amplified that discovery — because the loop optimizes for outcomes and reward hacking produces excellent outcomes. They report it plainly. There was no safeguard, because the agent judged its own trajectory and applied its own edits.

That is not an argument against self-improvement. It is an argument about who holds the pen.

The structural answer is that the thing being improved, the thing judging the improvement, and the thing applying the improvement must not all be the same agent. FleetCrown already gets two thirds of this right by accident of good design: the judge is a different model lineage from the worker, and the frontier loop proposes but never applies. What we need is to keep those properties when we point the loop inward — which is harder, because pointing it inward is exactly when auto-applying starts to feel efficient.

## What We Are Going to Do

The full plan lives in the repo. The shape of it:

**Make the corpus joinable.** Right now `prompt_history` has no reference to the run it produced. The two logs can only be matched by project, adapter, intent, and timestamp proximity — which falls apart under concurrency, and concurrency is the normal state of a fleet. Worse, the prompt is written *before* the run row exists, in a fire-and-forget call that never waits. So this is not the one-line schema change I initially thought it was; it is a column plus an ordering fix across three write sites. Naming that honestly is the difference between a plan that works and a plan that stalls in its first week.

**Measure before optimizing.** One report: per intent, over runs with real evidence, what fails, what it costs, and the ten most common reasons a reviewer rejected the work. This phase has a kill criterion, and it is the most important line in the plan — if the failures turn out to be dominated by rate limits and auth and network noise rather than instruction quality, then prompts were never the bottleneck and the entire remaining plan should be abandoned in favour of fixing infrastructure. I would rather find that out with one query than after building an optimizer.

**Repair the verifier before applying pressure to it.** An earlier audit found that ten of nineteen definitions of done were product-vague, which is why the fleet was closing far more runs partial than successful — the bar was the problem, not the agents. Optimizing against a vague bar produces confident nonsense. Fix the rubric first. This is the verification-horizon constraint applied to our own system.

**Then optimize, offline and gated.** Candidates generated from real run history, using the judge's critique sentence as the reflection signal, scored by the existing cross-lineage judge, output as a proposed diff to the prompt library that a human accepts or dismisses — the same gate the frontier loop already uses. Learned context stored as bullets with incremental deltas, so brevity bias can't quietly delete the specifics. Nothing auto-applies, at any phase, with no planned expiry on that rule.

**And carry lessons per project, as references rather than rules.** Memory is the largest and most proven family in the literature, and the phrasing matters — it is the cheapest known defence against the self-reinforcing error loop.

## The Part Worth Being Excited About

There is a real advantage here, and it is not one we can be beaten to easily.

A self-refining harness sees one session's trajectory. That is the unit it can learn from, because that is the unit it can see. FleetCrown sees every run, across every project, across every vendor's agent, with a graded outcome, a cost, and an independent verdict attached to each one.

Cross-project prompt optimization over a real multi-tenant rollout corpus is something a single-session harness structurally cannot do, because it never sees the second project. That is the defensible position, and the distance to it is one schema fix and one batch job.

We built the expensive half first — a verifier we can trust, outcomes we can compare, gates a human controls. Most teams building in this space did it the other way round and are now discovering that their optimizer has been climbing a hill made of noise.

I would rather be where we are. But only if we finish.
