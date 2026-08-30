export const TORONTO_SCHOOLS = [
  "A.Y. Jackson Secondary School",
  "Agincourt Collegiate Institute",
  "Albert Campbell Collegiate Institute",
  "Archbishop Romero Catholic Secondary School",
  "Birchmount Park Collegiate Institute",
  "Bishop Allen Academy",
  "Bishop Marrocco/Thomas Merton Catholic Secondary School",
  "Bloor Collegiate Institute",
  "C. W. Jefferys Collegiate Institute",
  "Cardinal Carter Academy for the Arts",
  "Cardinal Newman Catholic High School",
  "Cedarbrae Collegiate Institute",
  "Central Technical School",
  "Central Toronto Academy",
  "Chaminade College School",
  "Danforth Collegiate and Technical Institute",
  "Don Mills Collegiate Institute",
  "Downsview Secondary School",
  "Dr. Norman Bethune Collegiate Institute",
  "Earl Haig Secondary School",
  "East York Collegiate Institute",
  "Emery Collegiate Institute",
  "Etobicoke Collegiate Institute",
  "Etobicoke School of the Arts",
  "Father Henry Carr Catholic Secondary School",
  "Father John Redmond Catholic Secondary School",
  "Forest Hill Collegiate Institute",
  "Francis Libermann Catholic High School",
  "Georges Vanier Secondary School",
  "Harbord Collegiate Institute",
  "Humberside Collegiate Institute",
  "Jarvis Collegiate Institute",
  "L'Amoreaux Collegiate Institute",
  "Lawrence Park Collegiate Institute",
  "Leaside High School",
  "Lester B. Pearson Collegiate Institute",
  "Loretto Abbey Catholic Secondary School",
  "Loretto College School",
  "Madonna Catholic Secondary School",
  "Malvern Collegiate Institute",
  "Marc Garneau Collegiate Institute",
  "Marshall McLuhan Catholic Secondary School",
  "Mary Ward Catholic Secondary School",
  "Michael Power/St. Joseph High School",
  "Monarch Park Collegiate Institute",
  "Neil McNeil High School",
  "Newtonbrook Secondary School",
  "North Albion Collegiate Institute",
  "North Toronto Collegiate Institute",
  "Northern Secondary School",
  "Northview Heights Secondary School",
  "Notre Dame High School",
  "Oakwood Collegiate Institute",
  "Parkdale Collegiate Institute",
  "R. H. King Academy",
  "Richview Collegiate Institute",
  "Riverdale Collegiate Institute",
  "Rosedale Heights School of the Arts",
  "Runnymede Collegiate Institute",
  "SATEC @ W.A. Porter Collegiate Institute",
  "Senator O'Connor College School",
  "Silverthorn Collegiate Institute",
  "Sir John A. Macdonald Collegiate Institute",
  "Sir Oliver Mowat Collegiate Institute",
  "Sir Wilfrid Laurier Collegiate Institute",
  "St. Basil-the-Great College School",
  "St. Brother André Catholic High School",
  "St. John Henry Newman Catholic High School",
  "St. Joseph's College School",
  "St. Mary's Catholic Academy",
  "St. Michael's Choir School",
  "St. Patrick Catholic Secondary School",
  "Stephen Leacock Collegiate Institute",
  "Thistletown Collegiate Institute",
  "Victoria Park Collegiate Institute",
  "W. L. Mackenzie Collegiate Institute",
  "West Hill Collegiate Institute",
  "West Humber Collegiate Institute",
  "Western Technical-Commercial School",
  "Westview Centennial Secondary School",
  "Wexford Collegiate School for the Arts",
  "William Lyon Mackenzie Collegiate Institute",
  "Winston Churchill Collegiate Institute",
  "York Memorial Collegiate Institute",
  "York Mills Collegiate Institute",
  /*
   * "Other", like NEIGHBORHOODS and OPPORTUNITY_CATEGORIES below.
   *
   * Onboarding requires a school and offers only this list, with no free text.
   * TDSB alone runs about 110 secondary schools against these 85, and none of
   * the private, independent or French-board schools are here at all — so a
   * student whose school was missing could not finish onboarding, and the
   * dashboard sends them straight back to it. The account was permanently
   * unusable, with no error explaining why.
   */
  "Other"
].sort();

export const NEIGHBORHOODS = [
  "Agincourt",
  "Bayview Village",
  "Beaches / East York",
  "Central Toronto / Midtown",
  "Don Mills",
  "Downtown Toronto",
  "Downsview",
  "Etobicoke Center",
  "Etobicoke North",
  "Etobicoke South",
  "High Park / Parkdale",
  "Leslieville / Riverdale",
  "Newtonbrook",
  "North York Center",
  "Scarborough Center",
  "Scarborough North",
  "Scarborough South",
  "Willowdale",
  "York / Weston",
  "York Mills",
  "Other"
];

export const OPPORTUNITY_CATEGORIES = [
  'Animal Welfare',
  'Arts & Culture',
  'Children & Youth',
  'Community Services',
  'Education',
  'Environment',
  'Event Planning',
  'Food Banks',
  'Health & Hospitals',
  'Seniors',
  'Sports',
  'Technology',
  'Tutoring',
  'Other'
];

export const OPPORTUNITY_EXCLUSIVES = [
  'Club Exclusive',
  'School Exclusive',
  'Local Residents',
  'Disability Accessible',
  'Grade 9 Only',
  'Grade 10 Only',
  'Grade 11 Only',
  'Grade 12 Only'
];

/**
 * Organization types offered at signup.
 *
 * The list is drawn from what Ontario school boards actually publish as places
 * students earn community involvement hours — TDSB, TCDSB, York Region and Peel
 * — rather than invented categories, so a coordinator recognises their own kind
 * of organization rather than guessing.
 *
 * Ordered by how often each comes up in Toronto and North York, not
 * alphabetically: the common answers sit at the top where they are found
 * immediately, and the list is searchable for everything else.
 *
 * "Other" is last and takes a free-text answer, because no fixed list survives
 * contact with reality.
 */
export const ORGANIZATION_TYPES: { value: string; label: string }[] = [
  { value: 'Non-profit organization', label: 'Non-profit organization' },
  { value: 'Registered charity', label: 'Registered charity' },
  { value: 'For-profit organization', label: 'For-profit organization' },
  { value: 'Community group', label: 'Community group' },
  { value: 'School or educational institution', label: 'School or educational institution' },
  { value: 'Club', label: 'Club' },
  { value: 'Long-term care or seniors', label: "Long-term care home, retirement residence, or seniors' centre" },
  { value: 'Hospital or health care', label: 'Hospital, hospice, or health care institution' },
  { value: 'Food bank or meal program', label: 'Food bank, meal, or nutrition program' },
  { value: 'Public library', label: 'Public library' },
  { value: 'Place of worship', label: 'Place of worship or religious organization' },
  { value: 'Community or recreation centre', label: 'Community centre or recreation centre' },
  { value: 'Sports league or club', label: 'Sports league, club, or athletic association' },
  { value: 'Youth organization', label: 'Youth organization (Scouts, Guides, Boys & Girls Club)' },
  { value: 'Camp or holiday program', label: 'Summer camp, day camp, or March Break program' },
  { value: 'Child care or preschool', label: 'Child care centre, daycare, or preschool' },
  { value: 'Animal shelter or farm', label: 'Animal shelter, humane society, zoo, or farm' },
  { value: 'Environmental organization', label: 'Environmental or conservation organization' },
  { value: 'Arts or culture organization', label: 'Arts, culture, museum, or gallery organization' },
  { value: 'Social service agency', label: 'Social service agency, shelter, or community support service' },
  { value: 'Government program', label: 'Municipal, regional, provincial, or federal government program' },
  { value: 'Constituency office', label: "Elected representative's constituency office" },
  { value: 'Community event or festival', label: 'Community festival or one-off community event' },
  { value: 'Political organization', label: 'Political campaign or political organization' },
  { value: 'Emergency or public service', label: 'Emergency or public service agency (police, fire, paramedic)' },
  { value: 'First Nation, Metis, or Inuit organization', label: 'First Nation, Métis, or Inuit community or organization' },
  { value: 'Veterans organization', label: "Veterans' organization (e.g. Legion)" },
  { value: 'Service club', label: 'Service club (Rotary, Lions, Kiwanis)' },
  { value: 'Neighbourhood association', label: "Neighbourhood, residents', or tenants' association" },
  { value: 'Business improvement area', label: 'Business improvement area or chamber of commerce' },
  { value: 'Housing or shelter provider', label: 'Housing provider or shelter' },
  { value: 'Newcomer or settlement services', label: 'Newcomer or settlement services organization' },
  { value: 'Other', label: 'Other' },
];
