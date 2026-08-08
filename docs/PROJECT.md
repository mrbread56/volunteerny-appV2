# About Volunteer North York

Background, motivation and validation for the project. Written by the founder;
kept here so the README stays short and so anyone joining the project can
understand *why* it exists before reading how it works.

---

## Origin

Volunteer North York is a passion project started in late 2025, with serious
development beginning in 2026. The idea came from the founder's own experience
as a high school student trying to find meaningful volunteer opportunities in
Toronto.

In Ontario, high school students must complete **40 hours of community
involvement before graduating**. Completing those 40 hours is generally
achievable. Continuing to volunteer — and finding opportunities that genuinely
match your interests, availability and location — is much harder.

The founder has personally completed more than 100 volunteer hours and kept
hitting the same wall: you have to be in the right place at the right time.
Community centres approached in person turned out not to be taking volunteers
that month. Other opportunities existed but were hard to discover or did not fit
around school.

The problem is not that students do not want to volunteer. **The problem is
finding the right opportunity.**

## What the platform does

Connects high school students with nonprofit organizations that need volunteers.

**Students** create a profile, discover opportunities, apply directly, track
their volunteer hours, and receive recommendations.

**Organizations** create a profile, post opportunities, review applications, and
manage their volunteers.

## Scope

Despite the name, the platform is not restricted to North York students. North
York is where the project started and where the founder wanted to begin building
community relationships. The larger goal is to serve high school students across
Toronto.

## Who is building it

**One person.** The founder is the sole developer and does not have a
traditional software engineering background, having learned by building this
project with the help of AI development tools.

This matters for anyone assessing the codebase: it explains both the breadth of
what exists and the technical debt an external review identified. It is also why
[`ARCHITECTURE.md`](ARCHITECTURE.md), [`STATUS.md`](STATUS.md) and
[`ROADMAP.md`](ROADMAP.md) exist — so the project does not depend on one
person's memory.

There is no fixed deadline. The project is being stabilised before new features
are added.

## Validating the problem

Rather than relying on the founder's own judgement, feedback was sought from
students, university professors, software engineers and designers.

### Student survey

> *"Would you say finding a place to volunteer is one of the biggest challenges
> when trying to volunteer?"*

| Response | Count |
|---|---|
| Yes | 15 |
| No | 5 |
| **Total** | **20** |

**75% identified finding opportunities as a significant challenge.** The sample
is small and collection is ongoing, but it supports the problem that motivated
the project.

### Academic review

**Professor Marsha Chechik** — University of Toronto. Described the idea as
extremely useful and noted she knew of high school students and community
organizations that could use it. Her feedback pushed the project toward
scalability, security, privacy, and how student and organization data should be
structured.

**Professor Jian Zhao** — University of Waterloo. Described it as an "awesome
platform", citing the design, workflow and breadth of functionality. His
feedback focused on organization verification, student safety, recommendations,
community features, and understanding users' core needs.

**Professor Jeff Avery** — University of Waterloo. Described it as "a very
interesting project, and potentially very useful to schools and students".
Provided extensive feedback on simplifying the system, designing around
real-world scenarios, improving application workflows, managing volunteer hours,
and how organizations cope with many applicants.

A fourth reviewer conducted the technical audit that this repository's
[`REVIEW-RESPONSE.md`](REVIEW-RESPONSE.md) answers point by point.

### Design and performance

Design feedback led to significant changes: visual design, layout, imagery,
typography and performance. The platform was moved to Vercel to improve load
times.

---

## Status of the description above

Everything in this document is accurate as of August 2026, with one exception
worth recording rather than quietly fixing:

**Messaging between students and organizations is not built.** Earlier
descriptions of the project said students and organizations could communicate
through the platform. The `chats` and `messages` collections have complete
security rules and no interface — nothing in the application reads or writes
them. It is tracked as **B7** in [`STATUS.md`](STATUS.md) and scheduled in
[`ROADMAP.md`](ROADMAP.md) for v2.0.

Organizations and students currently reach each other by email, sent
automatically when an application changes status.

This is flagged because the description is shown to professors and reviewers,
and a feature that does not exist should not be listed among those that do.
