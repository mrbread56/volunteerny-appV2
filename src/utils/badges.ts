import { 
  Trophy, 
  Award, 
  Zap, 
  ShieldCheck, 
  Briefcase, 
  BookOpen, 
  Sparkles,
  Heart,
  UserCheck
} from "lucide-react";
import { StudentProfile } from "../types";

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  requirement: string;
  iconName: "trophy" | "award" | "zap" | "shield" | "briefcase" | "book" | "sparkles" | "heart" | "user";
  category: "milestone" | "skill" | "profile";
  unlockedAt: string;
}

export function evaluateBadges(profile: StudentProfile | null): { badge: BadgeDefinition; isUnlocked: boolean }[] {
  const loggedHoursList = profile?.loggedHours || [];
  const totalHours = loggedHoursList.reduce(
    (acc, current) => acc + Number(current.hours || 0),
    0
  );

  const skillsCount = profile?.skills?.length || 0;
  const hasSchool = !!profile?.school && profile?.school !== "Other";
  const hasResume = !!profile?.resumeUrl;
  const hasContact = !!(profile?.contactEmail && profile?.phone);
  const totalInterests = profile?.interests?.length || 0;

  const definitions: BadgeDefinition[] = [
    {
      id: "explorer",
      name: "Community Explorer",
      description: "Initiated your community volunteering journey by logging your first experience.",
      requirement: "Log at least 1 hour of volunteer service",
      iconName: "zap",
      category: "milestone",
      unlockedAt: "1+ Hours Completed"
    },
    {
      id: "contributor",
      name: "Dedicated Contributor",
      description: "Steadfast service helper in the North York community.",
      requirement: "Log 10 hours of active involvement",
      iconName: "heart",
      category: "milestone",
      unlockedAt: "10+ Hours Completed"
    },
    {
      id: "champion",
      name: "Involvement Champion",
      description: "Outstanding volunteer displaying ongoing dedication.",
      requirement: "Log 20 hours of volunteer involvement",
      iconName: "award",
      category: "milestone",
      unlockedAt: "20+ Hours Completed"
    },
    {
      id: "elite",
      name: "Elite Citizen",
      description: "Reaching the prestigious high school graduation volunteer milestone!",
      requirement: "Log 40 hours of community service",
      iconName: "trophy",
      category: "milestone",
      unlockedAt: "40+ Hours Completed"
    },
    {
      id: "polymath",
      name: "Polymath Profile",
      description: "Exhibiting a versatile skill set to partner organizations.",
      requirement: "Register 3 or more skills on your profile",
      iconName: "sparkles",
      category: "skill",
      unlockedAt: "3+ Skills Registered"
    },
    {
      id: "scholar",
      name: "Academic Scholar",
      description: "Account attached to a verified Toronto/York region community high school.",
      requirement: "Complete verified academic high school enrollment details",
      iconName: "book",
      category: "profile",
      unlockedAt: "School Verified"
    },
    {
      id: "resume",
      name: "Resume Ready",
      description: "Ready to apply immediately with documents that standing out to coordinators.",
      requirement: "Upload a compressed resume on your profile",
      iconName: "briefcase",
      category: "profile",
      unlockedAt: "Resume Document Attached"
    },
    {
      id: "communicator",
      name: "Active Communicator",
      description: "Complete contact coordinates ensuring seamless coordination emails/pings.",
      requirement: "Provide a contact email and active phone number",
      iconName: "user",
      category: "profile",
      unlockedAt: "Contact Details Complete"
    }
  ];

  return definitions.map(defn => {
    let isUnlocked = false;
    switch (defn.id) {
      case "explorer":
        isUnlocked = totalHours >= 1;
        break;
      case "contributor":
        isUnlocked = totalHours >= 10;
        break;
      case "champion":
        isUnlocked = totalHours >= 20;
        break;
      case "elite":
        isUnlocked = totalHours >= 40;
        break;
      case "polymath":
        isUnlocked = skillsCount >= 3;
        break;
      case "scholar":
        isUnlocked = hasSchool && !!profile?.grade;
        break;
      case "resume":
        isUnlocked = hasResume;
        break;
      case "communicator":
        isUnlocked = hasContact;
        break;
    }
    return { badge: defn, isUnlocked };
  });
}
