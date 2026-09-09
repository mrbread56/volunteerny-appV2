/**
 * Who has actually been contacted, and who only looks like they have.
 *
 * Three outreach batches went out from volunteernorthyorkbusiness@gmail.com.
 * The 19 August one did not go anywhere: Gmail answered almost every message
 * with "You have reached a limit for sending mail. Your message was not sent."
 * Those addresses show up in the Sent folder looking exactly like a delivered
 * email, which is how they came to be treated as contacted.
 *
 * Some were later re-sent by hand on 21, 25 and 26 August and did arrive. This
 * file is the difference: everyone attempted, minus everyone a message
 * actually reached.
 *
 *   npx tsx scripts/outreach-ledger.ts
 *
 * Sources are Gmail itself, read on 1 September 2026. Nothing here is inferred
 * from the Sent folder alone, which is the mistake that caused the problem.
 */

/** 19 Aug. Gmail refused to send these. The recipient never saw anything. */
const RATE_LIMITED = [
  'admin@kccatoronto.ca', 'bfhub@unisonhcs.org', 'candace@beby.org',
  'cnh_bayview@extendicare.com', 'contactus@dfrc.ca',
  'coordinator@torontonaturestewards.org', 'downsview@gemhealth.com',
  'fcreception@tno-toronto.org', 'gibson@agecare.ca', 'heather@nyba.ca',
  'info@apostlesrevelationsociety.com', 'info@bcchc.com', 'info@dukeheights.ca',
  'info@evergreen.ca', 'info@fhc-chc.com', 'info@girlguides.ca',
  'info@hawthorneplacecarecentre.ca', 'info@newcomersincanada.ca',
  'info@newcomerwomen.org', 'info@northtorontocatrescue.com', 'info@nyhs.ca',
  'info@nywc.org', 'info@prossermanjcc.com', 'info@spanishservices.org',
  'info@trca.ca', 'info@wknc.ca', 'info@yorktownfamilyservices.com',
  'intake@jiastoronto.org', 'jeffkb0567@gmail.com', 'ladyballerscamp@gmail.com',
  'liz.mcmulkin@toronto.ca', 'lysa.springer-laks@toronto.ca',
  'marinawilliams@rogers.com', 'media@taric.org', 'nykha.knights@gmail.com',
  'nyork@costi.org', 'pfrvolunteers@toronto.ca', 'receptionhd@afghanwomen.org',
  'seung.lee@salvationarmy.ca', 'storehouse@rhemaonline.ca',
  'stthomasaquinasto@archtoronto.org', 'swoolner@symewoolner.org',
  'tbc@tbc.on.ca', 'tzuchi@tzuchi.ca', 'volunteer@nygh.on.ca',
  'volunteer@tpl.ca', 'volunteering@villacolombo.on.ca', 'volunteers@hrh.ca',
  'webmaster@northyorkstorm.com',
  // second page of the same batch
  'crdbayviewgardens@amica.ca', 'crdbayview@amica.ca',
  'delmanorwynford@delmanor.com', 'reception@betelcentre.org',
  'rcny.monica@gmail.com', 'admin@workingwomencc.org', 'lyonrex@rogers.com',
  'secretary@rcl66.com', 'nych@nych.ca', 'info@nyacswimming.ca',
  'nysa@nysoccer.ca', 'ntbaregistrar@bell.net', 'connect@vosnl.org',
  'info@templesinai.net', 'admin@ldatd.on.ca', 'information@unitedforliteracy.ca',
  'rcl527president@hotmail.com', 'info@ehcw.ca', 'info@stalbansclub.ca',
  'info@betterlivinghealth.org', 'delmanornorthtown@delmanor.com',
  'info@lchaimretirement.ca', 'office@sjactoronto.com', 'info@cicscanada.com',
  'office@stgeorgestoronto.ca', 'info@onekentonplace.ca', 'info@tirgan.ca',
  'info@veahavta.org', 'volunteer@torontobotanicalgarden.ca',
  'info@yorkmemorialpresbyterianchurch.ca', 'foodbankmanager@waes.ca',
  'drjparke@thetriumphantchurchofgod.org', 'thistletownfoodbank@gmail.com',
  'info@anida.org', 'societyfortheliving@yahoo.ca', 'info@fcfoodbank.com',
];

/** 21, 25 and 26 Aug. Accepted by the receiving server. Never write again. */
const DELIVERED = [
  // 21 Aug
  'info@stalbansclub.ca', 'admin@ldatd.on.ca', 'information@unitedforliteracy.ca',
  'connect@vosnl.org', 'admin@janefinchcentre.org', 'pfrvolunteers@toronto.ca',
  'volunteer@tpl.ca', 'lysa.springer-laks@toronto.ca', 'liz.mcmulkin@toronto.ca',
  'info@betterlivinghealth.org', 'info@onekentonplace.ca',
  'info@lchaimretirement.ca', 'delmanornorthtown@delmanor.com',
  'office@sjactoronto.com', 'lansingunited@lansingchurch.com',
  // 25 Aug
  'info@tirgan.ca', 'info@bcchc.com', 'info@yorktownfamilyservices.com',
  'heather@nyba.ca', 'info@imdadulmasjid.com', 'info@newcomerwomen.org',
  'intake@jiastoronto.org', 'reception@betelcentre.org',
  'cnh_bayview@extendicare.com', 'volunteer@torontobotanicalgarden.ca',
  'downsvieweducation@clc-sic.ca', 'foodbank@mtzion.ca',
  'contact@chasdeikaduri.org', 'jf-com-min@rogers.com',
  // 26 Aug
  'info@elmcgroup.org', 'info@fcfoodbank.com', 'info@evergreen.ca',
  'gibson@agecare.ca', 'crdbayviewgardens@amica.ca', 'nyork@costi.org',
  'tbc@tbc.on.ca', 'info@nyacswimming.ca', 'contactus@dfrc.ca',
  'info@northtorontocatrescue.com', 'contact@communitysharefoodbank.ca',
  'societyfortheliving@yahoo.ca', 'info@anida.org',
  'thistletownfoodbank@gmail.com', 'foodbankmanager@waes.ca',
];

/**
 * 1 Sep, first batch of twelve. Plain URL in the body, no attachment. All
 * twelve accepted.
 */
const RESENT_2026_09_01 = [
  'admin@kccatoronto.ca', 'admin@workingwomencc.org', 'bfhub@unisonhcs.org',
  'candace@beby.org', 'coordinator@torontonaturestewards.org',
  'crdbayview@amica.ca', 'delmanorwynford@delmanor.com',
  'fcreception@tno-toronto.org', 'info@apostlesrevelationsociety.com',
  'info@cicscanada.com', 'info@dukeheights.ca', 'info@ehcw.ca',
];

/**
 * 1 Sep, second batch of twelve, sent about forty minutes after the first.
 * FOUR were accepted and EIGHT were blocked 5.7.1, and the cut is clean: the
 * first four went through, then every message from the fifth onward was
 * refused. Counting the day, the account accepted sixteen and then stopped.
 *
 * This corrects the earlier reading of the 26 August blocks. Those were
 * blamed on the google.com/url redirect wrappers in the body, and that was
 * wrong. These eight carried a plain URL, no attachment and no wrapper, and
 * were refused identically. The redirect links were a genuine defect and
 * fixing them was right, but they are not what causes a 5.7.1 here.
 *
 * What causes it is volume from a consumer Gmail account, measured now rather
 * than guessed at: SIXTEEN A DAY is the working ceiling on this mailbox. Not
 * 500, which is Google's documented figure, and not 24.
 */
const BLOCKED_2026_09_01 = [
  'info@newcomersincanada.ca', 'info@hawthorneplacecarecentre.ca',
  'info@prossermanjcc.com', 'info@templesinai.net', 'info@veahavta.org',
  'info@trca.ca', 'info@nyhs.ca', 'info@girlguides.ca',
];

/** Same batch, accepted before the ceiling was hit. */
const RESENT_2026_09_01_B = [
  'info@wknc.ca', 'info@nywc.org', 'info@fhc-chc.com', 'info@spanishservices.org',
];

/**
 * 3 Sep. Eleven accepted, one hard bounce, no quota block at all. Eight of
 * these are the ones Google refused with 5.7.1 on 1 Sep, and they went through
 * unchanged the moment the account was inside its limit again - which is the
 * last word on that argument. The message was never the problem. Volume was.
 */
const RESENT_2026_09_03 = [
  'info@girlguides.ca', 'info@hawthorneplacecarecentre.ca',
  'info@newcomersincanada.ca', 'info@nyhs.ca', 'info@prossermanjcc.com',
  'info@templesinai.net', 'info@trca.ca', 'info@veahavta.org',
  'info@yorkmemorialpresbyterianchurch.ca', 'ladyballerscamp@gmail.com',
  'jeffkb0567@gmail.com',
];

/**
 * 3 Sep, late. Three accepted, then the SIXTEENTH message of the day was
 * blocked 5.7.1 - counting the eleven that morning and one reply to KCCA. The
 * ceiling reproduced exactly: this mailbox takes fifteen and refuses the next.
 * receptionhd@afghanwomen.org never arrived and stays in the pool.
 */
const RESENT_2026_09_03_B = [
  'nych@nych.ca', 'media@taric.org', 'ntbaregistrar@bell.net',
];

/**
 * 4 Sep. The rest of the list, and no quota block anywhere in it. Eighteen
 * messages went out in one sitting, which is past the fifteen that had looked
 * like a hard ceiling on 1 and 3 Sep. So the limit is the rolling daily count,
 * not a per-session or per-hour throttle: once the previous day's messages
 * aged out, the whole remaining list went in one run.
 *
 * Two hard bounces, both dead addresses rather than anything to do with us.
 *
 * This empties the pool. Every organisation on the original list has now
 * received the outreach, or has an address that does not work.
 */
const RESENT_2026_09_04 = [
  'michael.ellison@toronto.ca', 'receptionhd@afghanwomen.org',
  'swoolner@symewoolner.org', 'storehouse@rhemaonline.ca',
  'seung.lee@salvationarmy.ca', 'secretary@rcl66.com',
  'rcl527president@hotmail.com', 'office@stgeorgestoronto.ca',
  'stthomasaquinasto@archtoronto.org', 'nykha.knights@gmail.com',
  'rcny.monica@gmail.com', 'tzuchi@tzuchi.ca', 'volunteers@hrh.ca',
  'volunteer@nygh.on.ca', 'volunteering@villacolombo.on.ca',
  'webmaster@northyorkstorm.com',
];

/**
 * 7 Sep. A NEW list, not the original ninety. These come from
 * outreach-prospects.ts, which is the queue of organisations found after the
 * first list was exhausted on 4 Sep.
 *
 * Twelve out, eleven accepted, one hard bounce, no quota block anywhere. That
 * is the third day running that twelve has been comfortable, so PER_DAY stays
 * where it is.
 */
const SENT_2026_09_07 = [
  'volunteer@baycrest.org', 'volunteer.admin@agakhanmuseum.org',
  'volunteering@ymcagta.org', 'wrowney@trca.on.ca',
  'volunteers@hollandbloorview.ca', 'tzvolunteers@torontozoo.ca',
  'kstintz@varietyontario.ca', 'toronto.programs@specialolympicsontario.ca',
  'picks@notfarfromthetree.org', 'volunteer@circleofcare.com',
  'volunteer@marchofdimes.ca',
  // three more the same evening, taking the day to fifteen. All accepted, so
  // the block sits at sixteen exactly as it did on 3 Sep. Fifteen is the
  // ceiling, not a coincidence, and twelve stays the number to plan on.
  'volunteer@sprintseniorcare.org', 'volunteering@reena.org',
  'swinter@cltoronto.ca',
  // sixteenth of the day, accepted.
  'volunteer@sunnybrook.ca',
];

/**
 * 7 Sep, from 21:47 onward. Everything blocked. NONE of these arrived, so they
 * stay in the pool and are deliberately NOT in the delivered set below.
 *
 * This was misdiagnosed twice before the control case turned up, and the wrong
 * turn is worth writing down because it is easy to repeat.
 *
 * The two bounce texts really are different things:
 *   "You have reached a limit for sending mail"  - obvious quota message
 *   "Message blocked ... Status 5.7.1"           - says nothing about quota
 *
 * The second one names the recipient, so it reads like the recipient refusing.
 * WoodGreen returned it twice, through two different API clients minutes
 * apart, which looked like proof of a recipient-side filter. It was not.
 *
 * What settled it: a throwaway message to a personal gmail address, 589 bytes,
 * subject "=-[p'", body "-0po;kl", sent at 21:52. Blocked with the same 5.7.1.
 * A few characters of nonsense to a Gmail account cannot be refused for content
 * or by the receiving server. Only the SENDER can be the cause.
 *
 * So 5.7.1 "Message blocked" is Google refusing to send, and it is what this
 * account returns once the daily allowance is gone. It does not always
 * announce itself as a limit.
 *
 * Sixteen were accepted today before the wall. The seventeenth and everything
 * after it failed. That matches 3 Sep, where fifteen went and the sixteenth
 * did not.
 *
 * If a 5.7.1 appears, STOP. Do not switch tools, do not retry, do not reword.
 * The mailbox is done for the day and every further attempt looks like a
 * delivered message in Sent while reaching nobody, which is the exact failure
 * that cost three weeks in August.
 */
const BLOCKED_2026_09_07 = [
  'volunteer@woodgreen.org',
  'volunteers@torontowildlifecentre.com',
  'volunteer@torontohumanesociety.com',
  'lross@bgctk.org',
];
void BLOCKED_2026_09_07;   // referenced here so the record is not silently dropped

/**
 * 9 Sep. The four above, sent again once the block cleared, and all four
 * accepted with no bounce.
 *
 * Sent two minutes apart rather than in a burst, which is the only thing that
 * changed. Same four addresses, same four messages, same mailbox. On 7 Sep
 * every one of them was refused; on 9 Sep every one went through. Nothing was
 * ever wrong with the recipients.
 *
 * The account had a full day untouched in between. That, and the spacing, is
 * what the recovery looks like.
 */
const RESENT_2026_09_09 = [
  'volunteers@torontowildlifecentre.com',
  'volunteer@torontohumanesociety.com',
  'lross@bgctk.org',
  'volunteer@woodgreen.org',
];

/**
 * 9 Sep, first contact. Seven from outreach-prospects.ts, all accepted.
 *
 * Twelve went out on 9 Sep counting the four resends above and one probe to a
 * personal address, spaced two minutes apart across about half an hour. Not
 * one bounced. The comparison worth keeping: 7 Sep put seventeen out as fast
 * as the tool would go and the last six were refused.
 */
const SENT_2026_09_09 = [
  'lisa@northyorkharvest.com',
  'mail@yay.org',
  'volunteerservices@alz.to',
  'volunteer@runnymedehc.ca',
  'info@jfandcs.com',
  'contactsmc@kensingtonhealth.org',
  'ontariovolunteer@redcross.ca',
  // two more the same afternoon, both accepted
  'info@heartssoccer.com',
  'volunteer@dixonhall.org',
];
void SENT_2026_09_09;   // first contact, not part of the original ninety

/**
 * 9 Sep. The fourteenth message of the day was the last one accepted.
 *
 * general@thestop.org was the fifteenth and it was refused. It was briefly
 * recorded above as sent, which was wrong: the bounce arrives about a second
 * after the send returns success, and the check ran too early to see it. That
 * is precisely the mistake this whole file exists to prevent, and it was made
 * again here, so: NEVER read a send as delivered without waiting for the
 * bounce. The API returning an id means Google accepted the request, not that
 * anyone received anything.
 *
 * Three further messages to a personal address were also refused, which is how
 * the ceiling was found.
 */
const BLOCKED_2026_09_09 = [
  'general@thestop.org',
];
void BLOCKED_2026_09_09;

/*
 * WHAT THE 9 SEP EXPERIMENT ACTUALLY SHOWED, since it is easy to misread.
 *
 * Fourteen delivered, fifteenth refused, with two minutes between every send.
 * On 3 Sep, fifteen delivered and the sixteenth was refused, sent fast.
 *
 * So spacing did NOT raise the ceiling. Fourteen to sixteen is where this
 * mailbox stops regardless of pace. What spacing appears to buy is a cleaner
 * run up to the ceiling rather than a higher one, and possibly a shorter block
 * afterwards, though one day is not enough to say that.
 *
 * The number to plan on stays twelve, and now for a better reason: it is the
 * only figure that has never been near a refusal.
 */

/** The address itself is broken. Resending changes nothing. */
const DEAD: Record<string, string> = {
  'downsview@gemhealth.com': 'address does not exist',
  'drjparke@thetriumphantchurchofgod.org': 'domain has no MX record',
  // 3 Sep: 554 30 Sorry, no mailbox here by that name. The Rotary Club of
  // Willowdale contact is gone; this needs a NEW address, not another attempt.
  'lyonrex@rogers.com': 'mailbox no longer exists (554)',
  // 4 Sep, both hard bounces on first contact.
  'nysa@nysoccer.ca': 'domain nysoccer.ca does not resolve',
  'marinawilliams@rogers.com': 'address not found (552)',
  // 7 Sep. Published on North York Harvest's OWN volunteer page as the contact
  // for community groups and schools, which is the best-matched address found
  // in the whole second sweep, and it does not exist. Their page is stale.
  // lisa@northyorkharvest.com is the replacement; call 416-635-7771 x2900
  // before spending another send on a guess.
  'leslie@northyorkharvest.com': 'address not found (550 5.2.1)',
};

/** Recipient's server refused the message, 26 Aug, SMTP 5.7.1. */
const REJECTED_5_7_1 = [
  'swoolner@symewoolner.org',
  'info@wknc.ca',
  'info@yorkmemorialpresbyterianchurch.ca',
];

/** Answered. Their wishes are on record and outrank any campaign. */
const REPLIED: Record<string, string> = {
  'info@tirgan.ca': 'SIGNED UP. Hours arranged with the office.',
  'info@fcfoodbank.com': 'SIGNED UP as Flemingdon Food Bank. After school and weekends only.',
  'contact@communitysharefoodbank.ca': 'SIGNED UP as Community Share Food Bank.',
  'thistletownfoodbank@gmail.com': 'DECLINED. "that was great but no thank you"',
  'info@nyacswimming.ca': 'DECLINED. "No Thanks."',
  'foodbank@mtzion.ca': 'DECLINED. Not accepting new volunteers.',
  'rcl527president@hotmail.com':
    'SIGNED UP as Royal Canadian Legion, Wilson Branch 527. Terry Frewin, '
    + 'Branch President. Account built and verified 8 Sep; he has not signed '
    + 'in yet and there are no postings. Wants help with the poppy campaign. '
    + 'Still unknown: dates, how many students at once, minimum age.',
};

/*
 * The poppy campaign has a fixed deadline nobody sets.
 *
 * Legion poppy distribution runs from the last Friday of October to 11
 * November, so roughly 30 Oct to 11 Nov 2026, and the preparation Terry means
 * by "the next few weeks" happens before that. This is the first reply with a
 * real calendar attached to it, and it wants an answer while the poppy boxes
 * are still being packed rather than after.
 *
 * It is also the best shaped work on the whole list for a 14 year old: short
 * shifts, a table in a public place, no training, and it repeats daily for two
 * weeks so one organisation can absorb a lot of students at once.
 */

/*
 * Terry Frewin writes from THREE addresses and they are one person.
 *
 *   rcl527president@hotmail.com   the branch role address, where outreach went
 *                                 and where the account login now lives
 *   t.frewin@rogers.com           what he actually replies from, on a phone
 *   tyrida3@gmail.com             a third he listed himself
 *
 * The account is on the role address on purpose, because it survives a change
 * of branch president in a way a personal Rogers address does not.
 *
 * THE CATCH: the six digit sign-in code goes to the account address. He was
 * given the password at Rogers, where he reads mail, but the code will arrive
 * at hotmail. If he says he cannot get in, that is why, and the fix is to move
 * the auth email rather than to resend anything.
 */

/** Not organisations. The founder's own addresses, used to test. */
const SELF = ['halalbeef67@gmail.com', '350343401@tdsb.ca'];

const norm = (s: string) => s.trim().toLowerCase();

export function buildLedger() {
  // BLOCKED_2026_09_01 is deliberately NOT here. Those eight never arrived and
  // stay in the send pool.
  const delivered = new Set(
    [...DELIVERED, ...RESENT_2026_09_01, ...RESENT_2026_09_01_B, ...RESENT_2026_09_03, ...RESENT_2026_09_03_B, ...RESENT_2026_09_04,
     ...SENT_2026_09_07, ...RESENT_2026_09_09].map(norm),
  );
  const dead = new Set(Object.keys(DEAD).map(norm));
  const self = new Set(SELF.map(norm));
  const declined = new Set(
    Object.entries(REPLIED).filter(([, v]) => v.startsWith('DECLINED')).map(([k]) => norm(k)),
  );

  const attempted = new Set([...RATE_LIMITED, ...REJECTED_5_7_1].map(norm));

  const send: string[] = [];
  const skip: { addr: string; why: string }[] = [];

  for (const addr of [...attempted].sort()) {
    if (self.has(addr)) skip.push({ addr, why: 'own address, test send' });
    else if (dead.has(addr)) skip.push({ addr, why: DEAD[addr] });
    else if (declined.has(addr)) skip.push({ addr, why: 'said no' });
    else if (delivered.has(addr)) skip.push({ addr, why: 'already received it' });
    else send.push(addr);
  }
  return { send, skip, delivered, attempted };
}

/**
 * Gmail's published cap for a free account is 500 recipients a day. The real
 * ceiling on this mailbox, measured on 1 September, is SIXTEEN: twelve went
 * through, then four more, then eight consecutive 5.7.1 blocks. Twelve a day
 * is inside that with margin. Twenty-four is not.
 */
const PER_DAY = 12;   // ponytail: 12 held on 1 Sep, 16 was the measured ceiling. Drop to 8 if another 5.7.1 appears.

function main() {
  const { send, skip, delivered, attempted } = buildLedger();

  console.log(`attempted, never received:  ${attempted.size}`);
  console.log(`confirmed delivered:        ${delivered.size}`);
  console.log(`TO SEND:                    ${send.length}`);
  console.log(`skipped:                    ${skip.length}\n`);

  console.log('SKIP');
  for (const { addr, why } of skip) console.log(`  ${addr.padEnd(42)} ${why}`);

  console.log('\nSEND PLAN');
  const start = new Date();
  for (let i = 0; i < send.length; i += PER_DAY) {
    const day = new Date(start);
    day.setDate(day.getDate() + i / PER_DAY);
    const label = day.toISOString().slice(0, 10);
    console.log(`\n  ${label}  (${Math.min(PER_DAY, send.length - i)})`);
    for (const a of send.slice(i, i + PER_DAY)) console.log(`     ${a}`);
  }
  console.log(`\n  ${Math.ceil(send.length / PER_DAY)} days at ${PER_DAY} a day, spaced several minutes apart.`);
}

// Only when run directly, so importing buildLedger stays quiet.
if (process.argv[1]?.includes('outreach-ledger')) main();
