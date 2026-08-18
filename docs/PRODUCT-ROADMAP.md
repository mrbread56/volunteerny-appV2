# Product roadmap

**Last updated:** 17 August 2026

This is the half of the plan that is not about code. `ROADMAP.md` tracks the
engineering; this tracks whether anyone uses what the engineering produced.

They are separate documents because they fail differently. Engineering work is
finished when a test passes. Product work is finished when a person who is not
you does something they did not have to do.

---

## The situation, stated plainly

| | |
|---|---|
| Students registered | **3** |
| Organisations registered | **0** |
| Organisations verified | **0** |
| Opportunities posted | **0** |
| Applications | **0** |
| Hours confirmed | **0** |

The software is tested to a standard most shipped products do not reach. None of
that matters yet, because the number that decides whether this is a product or a
prototype is the second row, and it is zero.

**No amount of further engineering moves that row.** This document exists to
stop the reflex of building another feature when the actual blocker is that
nobody has been asked to use the platform.

---

## What we are, precisely

**Volunteer Toronto is discovery. We are matching.**

That is not a slogan, it is a testable difference. Volunteer Toronto publishes
443 live listings and every one of them hands the student off through a
free-text "How to apply" box — usually an email address, sometimes an external
form, once a completely empty field. It delivers views. It delivers no applicant
record, no screening, no status, no hours, and no reporting. Everything after
the click lands in a coordinator's inbox as unstructured email.

Their own published figures: ~2,970 views per posting, 55,000+ searches a month.
An organisation there is not short of attention. It is short of a process.

**So the wedge is the post-click workflow**, not the listing. An organisation
keeps its free Volunteer Toronto posting and points the apply link here.

Three things follow from that framing, and they are why it is the right one:

- **Zero switching cost.** Nothing to migrate, nothing to abandon, no budget
  decision, no permission needed from anyone.
- **It works with zero students of our own**, because students arrive through
  the listing they were already going to see.
- **It stays defensible** after Volunteer Toronto eventually ships an apply
  button, because hour verification against the school-board form is a workflow
  they have never touched.

### Be honest about the counter-arguments

These came out of the research and they are more useful than the encouraging
parts:

1. **Time-saving is the second-place pain, not the first.** Ontario's 2025
   State of the Sector survey puts *attracting* volunteers at 61% and lack of
   resources to *manage* recruitment at 46%. We address the runner-up. With zero
   students we cannot credibly promise the winner.
2. **This segment is the least digitally adoptive in the sector.** 58% of
   Canadian charities under $100k annual revenue have no plans to integrate
   digital tools at all. "One coordinator, no budget, no IT" is a reason they
   say no, not a reason they need us.
3. **Price is not a lever.** Volunteer Toronto is free below $75k revenue and
   $130/year above it. There is nothing to undercut.
4. **Students may not have a matching problem.** In the study of Ontario's first
   mandated cohort, students who simply phoned around got yes answers. What they
   complained about was *paperwork* — one said the form was why they never
   recorded their hours at all. That points at verification, not discovery.
5. **Mandated volunteers carry reputational drag.** Coordinators report that
   40-hour students are visibly there because they have to be. Some do not want
   *more* of them; they want reliable ones.

**Points 1 and 5 converge on a sharper promise than "save time":** fewer,
screened, committed students with the paperwork already handled. Quality and
completion, not throughput. That is a promise keepable at five students. "We
will get you volunteers" is not.

---

## Phase 1 — prove one placement end to end

**Goal: one real student completes real hours at one real organisation, and the
record satisfies their school.**

Not ten organisations. One placement, all the way through.

| Target | Measure |
|---|---|
| Organisations registered | 3 |
| Organisations verified | 2 |
| Opportunities posted | 10 |
| Applications | 15 |
| **Completed placements** | **1** |
| **Hours confirmed** | **>0** |

**Done when:** a student prints their hours record, takes it to a guidance
office, and it is accepted. Until that has happened once, every claim this
platform makes about its purpose is an assumption.

**How to get the organisations — ranked:**

1. **Ask directly, in person or by phone.** Roughly 60% of marketplaces seeded
   supply this way; nothing else works as reliably at n<10. Two or three
   organisations you can actually reach beats a mailing list.
2. **The free "High School Volunteering — Ask Me Anything" webinar for
   nonprofits, 14 September 2026.** A room of coordinators who have
   self-selected into exactly this problem. It costs nothing to attend and is
   the single best-targeted acquisition event found in the research.
3. **Point at existing Volunteer Toronto postings.** The 19 or so live listings
   already flagged for youth are organisations that have proven they want
   14–17s. Offer to handle the applications for the one they already posted.
4. **Concierge the first five completely.** Do the intake by hand if necessary.
   For this segment, manual onboarding is not a growth hack — it is the product
   until it isn't.

**Do not spend anything acquiring students in this phase.** Every Ontario
student needs 40 hours; that side is mandated and will arrive. Roles that will
take a minor are the scarce side.

---

## Phase 2 — prove it repeats

**Goal: an organisation that used it once comes back without being asked.**

| Target | Measure |
|---|---|
| Organisations verified | 10 |
| Students with any confirmed hours | 25 |
| Completed placements | 20 |
| **Repeat rate** | **≥ 30% of organisations post a second role** |
| **Median days to decision** | **< 7** |

Repeat rate is the honest test of whether this is useful, because it is the one
number that cannot be produced by enthusiasm or by a favour.

---

## Phase 3 — prove it is faster

**Goal: make the claim defensible.**

The pitch is that the workflow saves a coordinator time. We cannot say that
until we have measured it.

| Target | Measure |
|---|---|
| Median days to decision | < 3 |
| Applications per completed placement | < 4 |
| Hours confirmed | 500 |
| Organisations verified | 25 |

**Done when** we can state a real before-and-after from a real coordinator, in
their words, with a number attached.

---

## Metrics: signal and vanity

`GET /api/metrics` reports both, deliberately separated.

**Vanity — will rise while nothing happens**

- Students registered — mandate-driven, costless, signals nothing
- Organisations registered — registering is not posting
- Opportunities posted — free and unlimited
- Applications — one click for a student

**Signal — required both sides to act**

- **`placementRate`** — the share of postings that produced at least one
  accepted applicant. **The headline.** The direct measurement of whether
  matching beats listing, and the mandate cannot inflate it.
- **`medianDaysToDecision`** — measurable from the very first application, and
  precisely what a listings board structurally cannot improve. **Watch this from
  n=1.**
- Completed placements
- Hours confirmed
- Acceptance rate

The sector does not have conversion benchmarks for any of this — Volunteer
Canada's 2025 report says so explicitly. Measuring it is worth something beyond
this project.

---

## Not doing, and why

**AI recommendations** — no data to train or validate against. The scoring
weights in `src/lib/matchScore.ts` are deterministic and explainable, and they
stay that way until real placement outcomes exist to tune them.

**A school dashboard** — no school has asked, and boards approve *activities*,
not platforms.

**Gamification, an advanced calendar, chat, a redesign** — none of these move
the row that reads zero.

**Paid acquisition** — cannot outbid free, and this segment does not buy
software.
