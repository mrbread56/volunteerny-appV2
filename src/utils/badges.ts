import { totalLoggedHours } from "../lib/hours";
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
  const totalHours = totalLoggedHours(loggedHoursList);

  const skillsCount = profile?.skills?.length || 0;
  const hasSchool = !!profile?.school && profile?.school !== "Other";
  const hasResume = !!profile?.resumeUrl;
  // contactEmail and phone were what the last badge tested, and a student has
  // neither: no student form collects them, they are absent from the students
  // validator in firestore.rules, and the update allow-list would reject a write
  // of either. So that badge could never unlock for anyone — it sat permanently
  // greyed out saying "Provide a contact email and active phone number" with
  // nowhere in the app to do it. It now tests fields students really do fill in.
  const hasIntroduction = !!(profile?.previousExperience || '').trim();
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
      description: "You have logged 40 confirmed hours here. Get them onto your school board's own form to count them toward graduation.",
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
      name: "School Added",
      description: "Your school and grade are on your profile, so organizations know who they are meeting.",
      requirement: "Add your school and grade",
      iconName: "book",
      category: "profile",
      unlockedAt: "School Added"
    },
    {
      id: "resume",
      name: "Resume Ready",
      description: "Organizations can see your resume the moment you apply.",
      requirement: "Upload a resume on your profile",
      iconName: "briefcase",
      category: "profile",
      unlockedAt: "Resume Document Attached"
    },
    {
      id: "communicator",
      name: "Well Introduced",
      description: "Told organizations who you are and what you care about, before they ever meet you.",
      requirement: "Write your previous experience and pick at least one interest",
      iconName: "user",
      category: "profile",
      unlockedAt: "Introduction Complete"
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
        isUnlocked = hasIntroduction && totalInterests >= 1;
        break;
    }
    return { badge: defn, isUnlocked };
  });
}
