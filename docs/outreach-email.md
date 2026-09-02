# The outreach email

The message sent from `volunteernorthyorkbusiness@gmail.com` to organizations,
asking them to come onto the site. Kept here because it is composed by hand in
Gmail and existed nowhere else, so nothing was version controlled and the
defects below were invisible.

**This is not sent by the app.** There is no outreach template in
`server/emailTemplates.ts` and there should not be: all eleven templates there
are transactional, triggered by something a user did. Cold outreach from the
Resend domain would put the domain that carries password resets and hour
confirmations at risk on the same reputation.

---

## Why the 26 August batch was blocked

Five hard failures in the last thirty days. Three of them share one signature:

```
Status: 5.7.1
Diagnostic-Code: smtp; Message rejected.
```

- `swoolner@symewoolner.org` — blocked, 26 Aug
- `info@wknc.ca` — blocked, 26 Aug
- `info@yorkmemorialpresbyterianchurch.ca` — blocked, 26 Aug

Three unrelated domains rejecting inside ninety seconds is not three
coincidental recipient policies. That is the sending side.

The other two are ordinary and not worth reading anything into:
`downsview@gemhealth.com` does not exist, and
`drjparke@thetriumphantchurchofgod.org` has no MX record at all.

### What is wrong with the message

**1. Both links are Google redirect wrappers.** The body does not link to
volunteernorthyork.org. It links to:

```
https://www.google.com/url?q=https://www.volunteernorthyork.org/&source=gmail&ust<0x17>787859496901000&sa=E
```

Twice. A cold email to a stranger whose only two links are `google.com/url`
redirectors is a textbook phishing shape, and filters score it that way. The
URL is also corrupt: `ust=1787859496901000` has been mangled into a literal
0x17 control character, so the link is malformed as well as wrapped.

This happens when a link is pasted into Gmail's composer from another Gmail
window rather than typed. **Type the address in directly.**

**2. An image attachment on a cold email.** Every message carries `icon.png`.
An unsolicited first-contact email with an image attached scores worse than the
same email with none, and the icon does no work.

**3. Roughly 600 words.** Not a rejection cause on its own, but it compounds.

**4. Burst sending.** The 26 August batch went out at 17 to 20 second
intervals. Consumer Gmail is not a bulk sender and treats that as one.

### What to do differently

- Type the URL as plain text: `volunteernorthyork.org`. No hyperlink pasted
  from Gmail, no tracking wrapper.
- Remove the attachment.
- Space the sends out. A handful an hour, not one every twenty seconds.
- Keep the opt-out line. It is the right thing and it also helps: under CASL a
  message to a conspicuously published business address about that
  organization's own work has implied consent, and a working unsubscribe is
  part of staying inside it.

---

## How many can actually go out in a day

Two different ceilings, and the lower one is not Google's.

**Google's technical cap.** A free Gmail account is 500 *recipients* a day, not
500 messages: every address across To, Cc and Bcc counts, so one email to
twenty people spends twenty. It resets on a rolling 24 hours from when the
messages went out, not at local midnight, and the block lasts one to
twenty-four hours. Google publishes no per-hour figure, but Gmail does throttle
velocity separately from the daily count.

**What we hit on 19 August was the daily cap, not the velocity throttle.** The
timing settles it: the first message of that batch went out at 20:56:36 and its
bounce arrived at 20:56:37, one second later. The block was already in force
before the batch started, so the 500 had been spent earlier that day. Every
message between 20:56 and 21:00, about eighty-six of them, was refused.

**The deliverability cap, which is far lower.** For cold outreach the practical
ceiling is 30 to 50 a day on an established mailbox and 10 to 30 on a new one;
a well-warmed inbox reaches 50 to 100. That is an order of magnitude under
Google's 500. Sending 500 cold emails a day from a young account is how the
account gets suspended and how the sending reputation goes bad, and a bad
reputation on this domain would take the password reset and hour confirmation
emails down with it. So 12 a day is not a limitation being worked around, it is
inside the safe band with room to spare.

**If the list grows to hundreds.** Google Workspace on volunteernorthyork.org
raises the technical cap to 2,000 a day and the safe cold-email rate to roughly
50 to 100 once warmed. Business Starter is about USD 7 per user per month paid
annually, or 8.40 monthly. Worth knowing that it would also close the inbound
item this file's sibling roadmap has parked until 16 November: Workspace hosts
hello@volunteernorthyork.org directly, so the forwardemail.net 90-day domain-age
rule stops applying. One subscription, two problems.

Do NOT move outreach onto the Resend sending domain to get volume. That domain
carries password resets, verification codes and hour confirmations. Cold email
reputation and transactional reputation must not share an identity.

---

## Current text, with the links fixed

Subject varies by the kind of organization. The ones used so far:

- food banks: `A student built something for food programs like yours`
- long-term care: `Students who would love to visit your residents`
- tutoring and literacy: `Teen tutors, looking for you right now`
- youth programs: `A student built something for youth programs like yours`
- newcomer services: `A student built something for newcomer programs`
- environment: `Students who want to help on your planting days`
- faith groups: `Local students want to help your programs`
- events and festivals: `Students who want to help at your events`

Body, with `{Organization}` and the one italicised line swapped per recipient:

```
Hello {Organization} team,

I hope this reaches whoever helps organize your volunteers.

My name is Kiamehr. I am a student at Earl Haig Secondary School here in North
York, going into Grade 10, and I want to explain why I spent the last several
months of my life building something, and why I am writing to you specifically.

In Ontario, every high school student has to complete 40 hours of community
involvement before they can graduate. Between me and my two friends, we have
done more than 600 hours. What surprised us was that the volunteering was never
the hard part. Finding it was.

I would come across an organization I genuinely wanted to help, and they were
not taking anyone that month. Or there was an opening, but it was an hour away
by bus. Or it ran during school. Or the minimum age was 16 and I was 14. I
wanted to help. I just could not find the door.

We thought it might just be us, so we asked other students one question: is
finding a place to volunteer one of the biggest challenges when you try to
volunteer? Out of the first 20 students, more than 70% said yes. It was not
just us.

So we built Volunteer North York: volunteernorthyork.org

Then we did something that felt terrifying at the time. We emailed professors
who had no reason at all to reply to three teenagers, and asked them to tear
the project apart.

Some of them wrote back.

Professor Marsha Chechik at the University of Toronto, who holds a chair in
software engineering, told us: "What you are doing is extremely useful and I
know of lots of high school kids (and community organizations!) that would be
ready to use it immediately."

Professor Jeff Avery at the University of Waterloo went through the whole thing
screen by screen and asked the questions we had never thought of, like what an
organization is supposed to do when 200 people apply and there are two spots.

And another professor at Waterloo asked the one question that changed
everything: students prove who they are with a school email, but who checks the
organizations? That question is the reason we now verify every single
organization before it can post anything. Our users are 14, 15 and 16 years
old. Their safety comes before every other feature we have.

Which brings me to why I am writing to you.

{One line naming what this organization actually does and the work a student
could take on. For a food bank: "Sorting, packing, and distribution days are
exactly the kind of work students are looking for, and the kind where an extra
pair of hands actually makes a difference that day."}

Here is my offer, and I want to make it as easy as I possibly can. You do not
have to sign up for anything, make an account, or fill anything in. Just reply
and tell me what you need help with, even one sentence, and I will build your
profile and your listing myself. I will send it to you to look over before
anything goes live, and if I have got something wrong I will fix it.

After that, students find you on their own and apply, every application lands
in one organized place instead of scattered through your inbox, and you choose
who you want. If it ever stops being useful, say the word and I take it down.
It costs nothing, there is no contract, and there is nothing to sign.

We are launching to students very soon, and right now we are looking for the
first organizations to be on the site so it is not empty when students arrive.
It would mean a lot to have a local organization like yours be one of them.

Thank you for reading this. I know you are busy doing the actual work in the
community, and I appreciate you giving a student a few minutes of your day.

If you would rather not hear from me again, just reply with no thanks and I
will not contact you.

Kiamehr
Volunteer North York
volunteernorthyork.org
```

The third professor stays unnamed on purpose. So does everything about the
councillor's office. Neither goes into a public or outbound message.
