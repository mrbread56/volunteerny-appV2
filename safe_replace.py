
with open("src/pages/StudentDashboard.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports & activeTab State
content = content.replace(
    "import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck } from \"lucide-react\";",
    "import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck, Settings } from \"lucide-react\";\nimport DashboardLayout from \"../components/layout/DashboardLayout\";"
)

content = content.replace(
    "\"dashboard\" | \"leaderboard\" | \"calendar\" | \"settings\"",
    "\"dashboard\" | \"applications\" | \"hours\" | \"leaderboard\" | \"settings\""
)

content = content.replace(
    "tabParam === \"leaderboard\" ||\n        tabParam === \"calendar\" ||",
    "tabParam === \"leaderboard\" ||\n        tabParam === \"applications\" ||\n        tabParam === \"hours\" ||"
)

content = content.replace(
    "const handleTabChange = (tab: \"dashboard\" | \"leaderboard\" | \"calendar\" | \"settings\") => {\n      setActiveTab(tab);",
    "const handleTabChange = (tab: string) => {\n      setActiveTab(tab as any);"
)


# 2. Main Return Wrapper
old_return = """  if (isLoading)
    return <div className="p-8 text-center">Loading your dashboard...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-ink tracking-tight">
          Hi, {studentProfile?.fullName || "Student"}
        </h1>
        <p className="text-ink-soft text-sm mt-1">
          Your volunteer dashboard
        </p>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "dashboard" ? ("""

new_return = """  if (isLoading)
    return <div className="p-8 text-center">Loading your dashboard...</div>;

  const sidebarItems = [
    { id: "dashboard", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "applications", label: "My Applications", icon: <Calendar className="w-4 h-4" /> },
    { id: "hours", label: "Hours & Verification", icon: <Clock className="w-4 h-4" /> },
    { id: "leaderboard", label: "Leaderboard", icon: <Trophy className="w-4 h-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <DashboardLayout
      title={`Hi, ${studentProfile?.fullName || "Student"}`}
      subtitle="Your volunteer dashboard"
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      <AnimatePresence mode="wait">
        {activeTab === "dashboard" && ("""

content = content.replace(old_return, new_return)


# 3. Splitting the Tabs
# Dashboard ends right before Applications
dashboard_app_split = """            {/* Main Column */}
            <div className="lg:col-span-2 space-y-8">
            {/* Recent Applications */}"""
dashboard_app_new = """            <div className="lg:col-span-2 space-y-8">
            {/* Recommended Opportunities */}"""
# We don't just replace, we need to restructure it. Wait, doing this via python script replacing strings is too brittle if a single space is off.

