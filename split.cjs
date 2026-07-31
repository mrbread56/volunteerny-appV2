
const fs = require("fs");
const lines = fs.readFileSync("src/pages/StudentDashboard.tsx", "utf8").split("\n");

const appsSection = lines.slice(1085, 1258).join("\n");
let recsSection = lines.slice(1258, 1311).join("\n");
recsSection = recsSection.substring(0, recsSection.lastIndexOf("</div>")); // remove Main Column wrapper

const hoursSection = lines.slice(1313, 1442).join("\n");
let waitlistSection = lines.slice(1442, 1508).join("\n");
waitlistSection = waitlistSection.substring(0, waitlistSection.lastIndexOf("<section>")); // remove stray section tag

let savedSectionStr = "<section>\n" + lines.slice(1508, 1535).join("\n");
savedSectionStr = savedSectionStr.substring(0, savedSectionStr.lastIndexOf("</div>")); // remove sidebar wrapper
savedSectionStr = savedSectionStr.substring(0, savedSectionStr.lastIndexOf("</div>")); // might have another extra

// The dashboard block starts at line 1074: {activeTab === "dashboard" && (
// and ends around line 1538 with `)} {activeTab === "leaderboard" && (`

let content = fs.readFileSync("src/pages/StudentDashboard.tsx", "utf8").replace(/\r\n/g, "\n");
// 1. Imports
content = content.replace(
    "import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck } from \"lucide-react\";",
    "import { Award, Zap, BookOpen, Briefcase, Heart, ShieldCheck, Settings } from \"lucide-react\";\nimport DashboardLayout from \"../components/layout/DashboardLayout\";"
);
content = content.replace(
    "\"dashboard\" | \"leaderboard\" | \"calendar\" | \"settings\"",
    "\"dashboard\" | \"applications\" | \"hours\" | \"leaderboard\" | \"settings\""
);
content = content.replace(
    "tabParam === \"leaderboard\" ||\n        tabParam === \"calendar\" ||",
    "tabParam === \"leaderboard\" ||\n        tabParam === \"applications\" ||\n        tabParam === \"hours\" ||"
);
content = content.replace(
    "const handleTabChange = (tab: \"dashboard\" | \"leaderboard\" | \"calendar\" | \"settings\") => {\n      setActiveTab(tab);",
    "const handleTabChange = (tab: string) => {\n      setActiveTab(tab as any);"
);

// 2. Wrap
const oldReturn = `  if (isLoading)
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
        {activeTab === "dashboard" ? (`;

const newReturn = `  if (isLoading)
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
      title={\`Hi, \${studentProfile?.fullName || "Student"}\`}
      subtitle="Your volunteer dashboard"
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      <AnimatePresence mode="wait">
        {activeTab === "dashboard" && (`;

content = content.replace(oldReturn, newReturn);
content = content.replace("      )}\n    </div>\n  );\n}", "      )}\n    </DashboardLayout>\n  );\n}");

// 3. New Tabs
const overviewTab = `
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <div>
              ${recsSection}
            </div>
            <div>
              ${hoursSection}
            </div>
          </motion.div>
        )}

        {activeTab === "applications" && (
          <motion.div
            key="applications"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2">
              ${appsSection}
            </div>
            <div>
              ${savedSectionStr}
            </div>
          </motion.div>
        )}

        {activeTab === "hours" && (
          <motion.div
            key="hours"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="max-w-3xl mx-auto"
          >
            ${hoursSection}
          </motion.div>
        )}`;


const dashboardStart = `<motion.div\n            key="dashboard"`;
const dashboardEnd = `) : activeTab === "leaderboard" /* Dedicated Leaderboard Tab Layout */ ? (`;
const blockStartIdx = content.indexOf(dashboardStart);
const blockEndIdx = content.indexOf(dashboardEnd);

content = content.substring(0, blockStartIdx) + overviewTab + "\n        {activeTab === \"leaderboard\" && (" + content.substring(blockEndIdx + dashboardEnd.length);
content = content.replace(") : activeTab === \"settings\" ? (", ")} {activeTab === \"settings\" && (");

const settingsInnerIdx = content.indexOf("className=\"max-w-3xl mx-auto space-y-8\"");
const settingsInnerEnd = content.indexOf(">", settingsInnerIdx) + 1;
content = content.substring(0, settingsInnerEnd) + "\n" + waitlistSection + "\n" + content.substring(settingsInnerEnd);

fs.writeFileSync("src/pages/StudentDashboard.tsx", content);
console.log("SUCCESS!!!");

