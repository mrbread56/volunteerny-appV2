/**
 * Organisations found but not yet written to. The queue, not the record.
 *
 * outreach-ledger.ts answers "who has been contacted". This answers "who is
 * left". They are separate files on purpose: the ledger is a factual record of
 * what Gmail actually accepted, and mixing prospects into it would let a
 * candidate be mistaken for a completed send, which is the exact confusion
 * that wasted the first three weeks of outreach.
 *
 * Every address here was read off the organisation's own site or a directory
 * entry, on 7 September 2026. None are inferred from a domain pattern. Where a
 * search result and the organisation's own page disagreed, the page won: the
 * Aga Khan Museum is volunteer.admin@agakhanmuseum.org on its own site, not
 * the akdn.org address that search results give.
 *
 * `fit` is the honest read on whether a 14 to 17 year old can actually
 * volunteer there, because an organisation that only takes adults is a wasted
 * send against a mailbox that accepts fifteen messages a day.
 *
 *   npx tsx scripts/outreach-prospects.ts
 */
import { readFileSync } from 'fs';

type Fit = 'strong' | 'ok' | 'check-age';

interface Prospect {
  org: string;
  email: string;
  area: string;
  fit: Fit;
  note?: string;
}

/** North York first, because that is the name on the door. */
export const PROSPECTS: Prospect[] = [
  // ── North York ────────────────────────────────────────────────────────────
  { org: 'North York Harvest Food Bank', email: 'lisa@northyorkharvest.com', area: 'North York', fit: 'strong',
    note: 'Lisa Anderson, Manager Volunteer Services, 416-635-7771 x2900. NOT leslie@: that address is on their own volunteer page for community groups and schools, but it hard bounced 550 5.2.1 "address not found" on 7 Sep 2026. Their page is out of date. kadian@ and shirah@ are the other two published addresses if this one fails too.' },
  { org: 'Baycrest', email: 'volunteer@baycrest.org', area: 'North York', fit: 'strong',
    note: 'Minimum age 13. Their own page lists earning high school volunteer hours as a benefit. Wants six months.' },
  { org: 'Aga Khan Museum', email: 'volunteer.admin@agakhanmuseum.org', area: 'Don Mills', fit: 'strong',
    note: 'Guest services, gift shop, museum educators, event setup.' },
  { org: 'YMCA of Greater Toronto', email: 'volunteering@ymcagta.org', area: 'North York', fit: 'strong',
    note: 'North York centre at 4580 Dufferin.' },
  { org: 'Circle of Care, Sinai Health', email: 'volunteer@circleofcare.com', area: 'North York', fit: 'ok',
    note: '4211 Yonge. Meals on Wheels needs drivers, but there are other roles.' },
  { org: 'March of Dimes Canada', email: 'volunteer@marchofdimes.ca', area: 'North York', fit: 'ok',
    note: '99 Duncan Mill Rd.' },
  { org: 'SPRINT Senior Care', email: 'volunteer@sprintseniorcare.org', area: 'North Toronto', fit: 'ok' },
  { org: 'Reena', email: 'volunteering@reena.org', area: 'North York', fit: 'ok',
    note: 'Asks for a resume, which stops most 15 year olds.' },
  { org: 'Toronto Wildlife Centre', email: 'volunteers@torontowildlifecentre.com', area: 'Downsview', fit: 'check-age',
    note: 'Attempted 7 Sep past the daily limit and blocked. Never delivered. Still to send.' },
  { org: 'Black Creek Pioneer Village', email: 'wrowney@trca.on.ca', area: 'North York', fit: 'strong',
    note: 'TRCA operates it, and info@trca.ca is already in the ledger. Different department, so not a duplicate, but say so if they mention it.' },
  { org: 'Community Living Toronto', email: 'swinter@cltoronto.ca', area: 'North York', fit: 'ok',
    note: 'Sarah Winter covers the Scarborough, North York and Etobicoke regions.' },
  { org: 'North York Hearts Soccer Club', email: 'info@heartssoccer.com', area: 'North York', fit: 'ok',
    note: '5720 Bathurst St, (647) 388-8135. Youth club with a house league, so game days and tournaments need bodies. Asked for as "Toronto Hearts", which is not a name that exists; this is the only club it can reasonably be.' },
  /*
   * "Toronto Knights" is NYKHA Knights, nykha.knights@gmail.com, and it is
   * NOT listed here because it is already in the ledger as delivered on
   * 4 September. Putting it in this file would queue a second cold email to an
   * organisation that has already had one and simply not replied. If the lead
   * is worth chasing it is a phone call, not another send.
   */
  { org: 'Griffin Centre', email: '', area: 'North York', fit: 'ok',
    note: 'NO EMAIL FOUND. 24 Silverview Dr, 416-222-1153. Phone only.' },

  // ── Toronto wide ──────────────────────────────────────────────────────────
  { org: 'Holland Bloorview Kids Rehabilitation', email: 'volunteers@hollandbloorview.ca', area: 'Toronto', fit: 'strong' },
  { org: 'Sunnybrook Health Sciences Centre', email: 'volunteer@sunnybrook.ca', area: 'Toronto', fit: 'ok' },
  { org: 'Runnymede Healthcare Centre', email: 'volunteer@runnymedehc.ca', area: 'Toronto', fit: 'ok' },
  { org: 'Hospice Toronto', email: 'volunteer@hospicetoronto.ca', area: 'Toronto', fit: 'check-age' },
  { org: 'Toronto Humane Society', email: 'volunteer@torontohumanesociety.com', area: 'Toronto', fit: 'check-age',
    note: 'Very popular with students. Shelters often set 16 or 18. Attempted 7 Sep past the daily limit and blocked. Never delivered. Still to send.' },
  { org: 'Toronto Zoo', email: 'tzvolunteers@torontozoo.ca', area: 'Scarborough', fit: 'strong',
    note: 'Runs a Zoo Ambassador Student Volunteer stream.' },
  { org: 'Variety Village', email: 'kstintz@varietyontario.ca', area: 'Scarborough', fit: 'strong',
    note: 'Volunteers 15 and older. Sport programs and events.' },
  { org: 'Special Olympics Toronto', email: 'toronto.programs@specialolympicsontario.ca', area: 'Toronto', fit: 'strong' },
  { org: 'WoodGreen Community Services', email: 'volunteer@woodgreen.org', area: 'East Toronto', fit: 'ok',
    note: 'Attempted twice on 7 Sep after the daily send limit was already gone. Never delivered, nothing to do with WoodGreen. Still to send.' },
  { org: 'Dixon Hall', email: 'volunteer@dixonhall.org', area: 'Downtown East', fit: 'ok' },
  { org: 'Fred Victor', email: 'volunteer@fredvictor.org', area: 'Downtown', fit: 'check-age' },
  { org: 'Yonge Street Mission', email: 'volunteer@ysm.ca', area: 'Downtown East', fit: 'check-age' },
  { org: 'The Stop Community Food Centre', email: 'general@thestop.org', area: 'Davenport', fit: 'ok' },
  { org: 'Red Door Family Shelter', email: 'volunteer@reddoorshelter.ca', area: 'East Toronto', fit: 'check-age' },
  { org: 'Sistering', email: 'volunteer@sistering.org', area: 'Bloor West', fit: 'check-age',
    note: 'Women only, and likely adults.' },
  { org: "Nellie's", email: 'community@nellies.org', area: 'East Toronto', fit: 'check-age',
    note: 'Women only, and likely adults.' },
  { org: 'Covenant House Toronto', email: 'inquiries@covenanthouse.ca', area: 'Downtown', fit: 'check-age',
    note: 'Youth shelter, volunteers usually 18+.' },
  { org: 'PARC', email: 'info@parc.on.ca', area: 'Parkdale', fit: 'check-age',
    note: 'Their volunteer programme is in transition, expect a slow reply.' },
  { org: 'The 519', email: 'WWebb@the519.org', area: 'Church-Wellesley', fit: 'ok' },
  { org: 'Central Neighbourhood House', email: 'central@cnh.on.ca', area: 'Downtown East', fit: 'ok' },
  { org: 'The Neighbourhood Group', email: 'b.sinclair@tngcs.org', area: 'East Toronto', fit: 'ok',
    note: 'Vulnerable sector screening and references required.' },
  { org: 'Second Mile Club of Toronto', email: 'contactsmc@kensingtonhealth.org', area: 'Toronto', fit: 'ok' },
  { org: 'Jewish Family and Child Service', email: 'info@jfandcs.com', area: 'Toronto', fit: 'ok',
    note: 'Andrea Pines is the volunteer coordinator, ext 6234.' },
  { org: 'Alzheimer Society of Toronto', email: 'volunteerservices@alz.to', area: 'Midtown', fit: 'ok' },
  { org: 'Mon Sheong Foundation', email: 'volunteer@monsheong.org', area: 'Toronto', fit: 'check-age',
    note: '16+, vulnerable sector check AND a TB test. High friction.' },
  { org: 'Canadian Red Cross, Ontario', email: 'ontariovolunteer@redcross.ca', area: 'Toronto', fit: 'ok' },
  { org: 'Youth Assisting Youth', email: 'mail@yay.org', area: 'North York', fit: 'ok',
    note: 'Mentors are 16 to 29, so Grade 11 and 12 only. 5734 Yonge.' },
  { org: 'YouthLink', email: 'pathways@youthlink.ca', area: 'Scarborough', fit: 'ok',
    note: 'Pathways to Education tutoring. Wants a resume.' },
  { org: 'East Metro Youth Services', email: 'emys@emys.on.ca', area: 'Scarborough', fit: 'ok' },
  { org: 'BGC Toronto Kiwanis', email: 'lross@bgctk.org', area: 'Downtown East', fit: 'ok',
    note: 'Louise Ross. Attempted 7 Sep past the daily limit and blocked. Never delivered. Still to send.' },
  { org: 'Native Child and Family Services', email: 'info@nativechild.org', area: 'Toronto', fit: 'ok' },
  { org: 'Skills for Change', email: 'hr@skillsforchange.org', area: 'St Clair West', fit: 'ok' },
  { org: 'CultureLink Settlement', email: 'reception@culturelink.ca', area: 'West Toronto', fit: 'ok' },
  { org: 'Scarborough Centre for Healthy Communities', email: 'agovil@schcontario.ca', area: 'Scarborough', fit: 'ok' },
  { org: 'Albion Neighbourhood Services', email: 'ans@albionservices.ca', area: 'Etobicoke', fit: 'ok' },
  { org: 'Etobicoke Services for Seniors', email: 'volunteer@esssupportservices.ca', area: 'Etobicoke', fit: 'ok' },
  { org: 'Not Far From the Tree', email: 'picks@notfarfromthetree.org', area: 'Toronto', fit: 'strong',
    note: 'Fruit picking, seasonal, one-off shifts. Good shape for a first placement.' },
  { org: 'High Park Nature Centre', email: 'info@highparknaturecentre.com', area: 'High Park', fit: 'ok' },
  { org: 'High Park Stewards', email: 'stewards@highparknature.org', area: 'High Park', fit: 'ok' },
  { org: 'Big Brothers Big Sisters of Toronto', email: 'enrolment.to@bigbrothersbigsisters.ca', area: 'Toronto', fit: 'check-age',
    note: 'Mentors must be adults. Probably not worth a send.' },
  { org: 'Yee Hong Centre', email: 'centre@yeehong.com', area: 'Scarborough', fit: 'ok' },
];

/**
 * Ruled out before they reached the list, so nobody re-researches them:
 *
 *   Second Harvest            19+, per their own floor
 *   Daily Bread Food Bank     18+
 *   LEAF (urban forest)       18+ only, stated on their volunteer page
 *   Ontario Science Centre    not recruiting volunteers at all
 *   SKETCH Working Arts       closed
 *   Frontier College          same organisation as United for Literacy, already in the ledger
 *
 * Real organisations with no published email, phone only:
 *   St John Ambulance Toronto, Furniture Bank, CNIB, West Park Healthcare,
 *   Providence Healthcare, Michael Garron (runs a student programme, worth a
 *   call), Ronald McDonald House, Massey Centre, Agincourt Community Services.
 */

function main() {
  const ledger = readFileSync(new URL('./outreach-ledger.ts', import.meta.url), 'utf8');
  const contacted = new Set(
    [...ledger.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1].toLowerCase()),
  );

  const withEmail = PROSPECTS.filter((p) => p.email);
  const collisions = withEmail.filter((p) => contacted.has(p.email.toLowerCase()));

  console.log(`prospects with an address : ${withEmail.length}`);
  console.log(`already in the ledger     : ${collisions.length}`);
  if (collisions.length) {
    for (const c of collisions) console.log(`  DUPLICATE  ${c.email}  ${c.org}`);
    process.exitCode = 1;
  }

  const by = (f: Fit) => withEmail.filter((p) => p.fit === f);
  console.log(`\nstrong ${by('strong').length}   ok ${by('ok').length}   check the age first ${by('check-age').length}`);

  const perDay = 12;   // under the observed 15 ceiling, with room for replies
  console.log(`\nAt ${perDay} a day that is ${Math.ceil(withEmail.length / perDay)} days.\n`);

  for (const f of ['strong', 'ok', 'check-age'] as Fit[]) {
    console.log(`── ${f} ──`);
    for (const p of by(f)) {
      console.log(`  ${p.email.padEnd(46)}${p.org}  (${p.area})`);
    }
  }
}

main();
