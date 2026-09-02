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

/** The address itself is broken. Resending changes nothing. */
const DEAD: Record<string, string> = {
  'downsview@gemhealth.com': 'address does not exist',
  'drjparke@thetriumphantchurchofgod.org': 'domain has no MX record',
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
};

/** Not organisations. The founder's own addresses, used to test. */
const SELF = ['halalbeef67@gmail.com', '350343401@tdsb.ca'];

const norm = (s: string) => s.trim().toLowerCase();

export function buildLedger() {
  // BLOCKED_2026_09_01 is deliberately NOT here. Those eight never arrived and
  // stay in the send pool.
  const delivered = new Set(
    [...DELIVERED, ...RESENT_2026_09_01, ...RESENT_2026_09_01_B].map(norm),
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
