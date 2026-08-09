# About Volunteer North York

Volunteer North York is a passion project that I started in late 2025 and began
developing seriously in 2026. The idea came from my own experience as a high
school student trying to find meaningful volunteer opportunities in Toronto.

In Ontario, high school students are required to complete 40 hours of community
involvement before graduating. Completing those 40 hours is generally
achievable, but I found that continuing to volunteer, and finding opportunities
that genuinely match your interests, availability and location, can be much
more difficult.

I have personally completed more than 100 volunteer hours, but I repeatedly ran
into the same problem: you have to be in the right place at the right time. I
have gone to community centres looking for volunteer opportunities only to find
out that they were not accepting volunteers during that particular month. In
other situations, opportunities existed but were difficult to discover or did
not fit my availability.

This experience made me realize that the problem is not necessarily that
students do not want to volunteer. The problem is often finding the right
opportunity.

Volunteer North York was created to address that problem.

## What the platform does

The platform is designed specifically around connecting high school students
with nonprofit organizations that need volunteers. Students can create profiles,
discover volunteer opportunities, apply directly, track their volunteer hours,
and receive recommendations. Organizations can create profiles, post
opportunities, review applications, and manage their volunteers.

Although the project is called Volunteer North York, it is not restricted to
North York students. North York is where the project was started and where I
wanted to begin building relationships with the community. The larger goal is
to make the platform useful for high school students across Toronto.

## Who is building it

I am currently the sole developer of the platform. I do not have a traditional
software engineering background, so I have learned by building the project
myself and using AI development tools. The platform has gone through many
iterations as I have learned more about software development, design, user
experience, security, and building for real users.

That matters for anyone reviewing the code, because it explains both how much
exists and the technical debt an external review identified. It is also why
[ARCHITECTURE.md](ARCHITECTURE.md), [STATUS.md](STATUS.md) and
[ROADMAP.md](ROADMAP.md) exist, so the project does not depend on one person
remembering how everything fits together.

There is no fixed deadline. The current priority is stabilizing what exists
before adding new features.

## Validating the problem

Rather than relying only on my own opinion about whether the idea is useful, I
have actively sought feedback from students, university professors, software
engineers, and designers.

### Student survey

We conducted an initial student survey to see whether the problem we
experienced was shared by other students. We asked:

> "Would you say finding a place to volunteer is one of the biggest challenges
> when trying to volunteer?"

| Response | Count |
|---|---|
| Yes | 15 |
| No | 5 |
| **Total** | **20** |

Out of 20 students surveyed, 15 answered yes and 5 answered no. This means 75%
of the students surveyed identified finding volunteer opportunities as a
significant challenge. While this is still a small sample and we are continuing
to collect responses, the results have been encouraging because they support the
problem that originally motivated the project.

### Feedback from professors

**Professor Marsha Chechik**, University of Toronto, reviewed the project and
described the idea as extremely useful, noting that she knew of high school
students and community organizations that could potentially use it. Her feedback
also pushed us to think more carefully about scalability, security, privacy, and
how student and organization data should be structured.

**Professor Jian Zhao**, University of Waterloo, reviewed the platform and
described it as an "awesome platform", specifically noting the design, workflow,
and breadth of functionality. His feedback focused on areas including
organization verification, student safety, recommendations, community features,
and understanding users' core needs.

**Professor Jeff Avery**, University of Waterloo, also conducted a detailed
review and described it as "a very interesting project, and potentially very
useful to schools and students". He provided extensive feedback on simplifying
the system, designing around real-world user scenarios, improving application
workflows, managing volunteer hours, and considering how organizations would use
the platform with many applicants.

A fourth reviewer carried out a technical audit of the codebase itself. That
audit is answered point by point in
[REVIEW-RESPONSE.md](REVIEW-RESPONSE.md).

### Design and performance

We have also received design feedback that has led to significant changes to the
website, including improvements to the visual design, layout, imagery,
typography, and performance. Based on feedback we received, the platform was
also moved to Vercel to improve loading speed.

## Where the project is now

The project is still evolving. What began as a personal frustration has
developed into a working platform with student and organization functionality,
an initial validation of the problem through student responses, and feedback
from people with experience in software engineering, HCI, and design.

One correction worth recording here, because earlier descriptions of the project
said otherwise: messaging between students and organizations is not built. The
`chats` and `messages` collections were removed during the technical audit
because they had security rules but no interface behind them. Organizations and
students currently reach each other by email, which is sent automatically when
an application changes status. Messaging is planned for a later version and is
listed in [ROADMAP.md](ROADMAP.md).

The long-term goal of Volunteer North York is to make finding volunteer
opportunities much easier for high school students while giving nonprofit
organizations a more effective way to find students who genuinely want to
contribute. Ultimately, I want to see whether a solution that started from one
student's experience can grow into something that provides real value to
students and organizations throughout Toronto.
