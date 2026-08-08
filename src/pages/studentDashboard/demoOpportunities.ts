import type { Opportunity } from '../../types';

/**
 * Fixture opportunities for demo mode ONLY.
 *
 * This data is fabricated — invented titles, invented addresses, invented
 * organizations. It once leaked onto the real signed-in path: StudentDashboard
 * fell back to it whenever the opportunities collection came back empty, which
 * is also its state on launch day, so every real student was shown three
 * volunteer placements that do not exist. The browse page meanwhile rendered a
 * correct empty state, so the two screens contradicted each other.
 *
 * It lives in its own file so that cannot happen by accident again: if you find
 * yourself importing this outside a demo-mode branch, stop.
 */
export const DEMO_OPPORTUNITIES: Opportunity[] = [
  {
    id: "demo-opp-1",
    orgId: "demo-org-1",
    title: "Math Tutor for Grade 9 Students",
    description: "Help high school students with algebra, geometry, and key math concepts.",
    location: "5100 Yonge St, North York",
    dateTime: new Date(Date.now() + 86400000 * 2) as any,
    category: "Tutoring",
    requirements: "Excellent tutoring skills.",
    maxVolunteers: 5,
    skillsNeeded: ["Teaching", "Communication"],
    timeCommitment: "Short-term",
    isVirtual: false,
    createdAt: new Date(Date.now() - 86400000 * 3) as any,
  },
  {
    id: "demo-opp-2",
    orgId: "demo-org-2",
    title: "Community Garden Cleanup Initiative",
    description: "Join us for a day of planting, raking, and cleanup at the organic community art garden.",
    location: "Lee Lifeson Art Park, North York",
    dateTime: new Date(Date.now() + 86400000 * 7) as any,
    category: "Environment",
    requirements: "Love for outdoor work.",
    maxVolunteers: 15,
    skillsNeeded: ["Physical Work", "Leadership"],
    timeCommitment: "One-time",
    isVirtual: false,
    createdAt: new Date(Date.now() - 86400000 * 5) as any,
  },
  {
    id: "demo-opp-3",
    orgId: "demo-org-3",
    title: "Senior Tech Support Circle",
    description: "Empower local seniors by teaching them how to safely browse, use smartphones, and connect with families.",
    location: "21 Hendon Ave, North York",
    dateTime: new Date(Date.now() + 86400000 * 1) as any,
    category: "Seniors",
    requirements: "Patience and tech knowledge.",
    maxVolunteers: 4,
    skillsNeeded: ["Computer & Tech", "Communication"],
    timeCommitment: "Long-term",
    isVirtual: false,
    createdAt: new Date(Date.now() - 86400000 * 1) as any,
  },
  {
    id: "demo-opp-4",
    orgId: "demo-org-4",
    title: "Spring Festival Event Organizer",
    description: "Support logistically with stage coordination, welcoming community guests, and running vendor booths.",
    location: "Mel Lastman Square",
    dateTime: new Date(Date.now() + 86400000 * 5) as any,
    category: "Event Planning",
    requirements: "Cheerful personality.",
    maxVolunteers: 10,
    skillsNeeded: ["Organization", "Event Support"],
    timeCommitment: "One-time",
    isVirtual: false,
    createdAt: new Date(Date.now() - 86400000 * 2) as any,
  },
  {
    id: "demo-opp-5",
    orgId: "demo-org-5",
    title: "Weekend Food Hamper Drive",
    description: "Help organize, load, and dispense essential grocery items for local families in North York.",
    location: "North York Foodbank Hub",
    dateTime: new Date(Date.now() + 86400000 * 4) as any,
    category: "Food Banks",
    requirements: "Must be able to lift up to 15 lbs.",
    maxVolunteers: 8,
    skillsNeeded: ["Physical Work", "Organization"],
    timeCommitment: "Short-term",
    isVirtual: false,
    createdAt: new Date(Date.now() - 86400000 * 6) as any,
  },
  {
    id: "demo-opp-6",
    orgId: "demo-org-1",
    title: "HTML/JS Coding Club Instructor",
    description: "Contribute to building introductory coding exercises and run workshops for kids.",
    location: "5100 Yonge St, North York",
    dateTime: new Date(Date.now() + 86400000 * 3) as any,
    category: "Technology",
    requirements: "Proficient in basic HTML / CSS / Javascript.",
    maxVolunteers: 3,
    skillsNeeded: ["Computer & Tech", "Teaching"],
    timeCommitment: "Long-term",
    isVirtual: true,
    createdAt: new Date(Date.now() - 86400000 * 4) as any,
  }
];
