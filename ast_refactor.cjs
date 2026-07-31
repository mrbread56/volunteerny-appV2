
const { Project, SyntaxKind } = require("ts-morph");
const project = new Project();
project.addSourceFilesAtPaths("src/pages/StudentDashboard.tsx");
const sourceFile = project.getSourceFileOrThrow("src/pages/StudentDashboard.tsx");

// 1. Update imports
const importDecls = sourceFile.getImportDeclarations();
const lucideImport = importDecls.find(i => i.getModuleSpecifierValue() === "lucide-react");
if (lucideImport) {
    const named = lucideImport.getNamedImports().map(n => n.getName());
    if (!named.includes("Settings")) {
        lucideImport.addNamedImport("Settings");
    }
}
if (!importDecls.some(i => i.getModuleSpecifierValue() === "../components/layout/DashboardLayout")) {
    sourceFile.addImportDeclaration({
        defaultImport: "DashboardLayout",
        moduleSpecifier: "../components/layout/DashboardLayout"
    });
}

// 2. Update activeTab state definition
const func = sourceFile.getFunction("StudentDashboard");
const activeTabState = func.getVariableStatement("activeTab");
if (activeTabState) {
    activeTabState.replaceWithText(`const [activeTab, setActiveTab] = useState<"dashboard" | "applications" | "hours" | "leaderboard" | "settings">("dashboard");`);
}

// Update useEffect for activeTab
const useEffects = func.getDescendantsOfKind(SyntaxKind.CallExpression).filter(c => c.getExpression().getText() === "useEffect");
const tabEffect = useEffects.find(e => e.getText().includes("tabParam ==="));
if (tabEffect) {
    tabEffect.replaceWithText(`useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "leaderboard" || tabParam === "applications" || tabParam === "hours" || tabParam === "dashboard" || tabParam === "settings") {
      setActiveTab(tabParam as any);
    }
  }, [searchParams])`);
}

// Update handleTabChange
const handleTabChange = func.getVariableDeclaration("handleTabChange");
if (handleTabChange) {
    handleTabChange.getInitializer().replaceWithText(`(tab: string) => {
    setActiveTab(tab as any);
    setSearchParams({ tab });
  }`);
}

// 3. Extract components
const returnStmt = func.getStatements().find(s => s.getKind() === SyntaxKind.ReturnStatement && s.getText().includes("max-w-6xl"));
const animatePresence = returnStmt.getFirstDescendant(n => n.getKind() === SyntaxKind.JsxElement && n.getOpeningElement().getTagNameNode().getText() === "AnimatePresence");
const dashboardExpr = animatePresence.getJsxChildren().find(c => c.getKind() === SyntaxKind.JsxExpression);

const condExpr = dashboardExpr.getExpression();
const dashboardMotionDiv = condExpr.getWhenTrue().asKind(SyntaxKind.ParenthesizedExpression).getExpression();
const children = dashboardMotionDiv.getJsxChildren().filter(c => c.getKind() === SyntaxKind.JsxElement);

const mainColSections = children[0].getJsxChildren().filter(c => c.getKind() === SyntaxKind.JsxElement);
const appsSection = mainColSections[0].getText();
const recsSection = mainColSections[1].getText();

const sidebarSections = children[1].getJsxChildren().filter(c => c.getKind() === SyntaxKind.JsxElement);
const hoursSection = sidebarSections[0].getText();
const waitlistSection = sidebarSections[1].getText();
const savedSection = sidebarSections[2].getText();

const lbCond = condExpr.getWhenFalse();
const lbMotionDiv = lbCond.getWhenTrue().asKind(SyntaxKind.ParenthesizedExpression).getExpression().getText();

const settingsCond = lbCond.getWhenFalse();
let settingsMotionDivText = settingsCond.getWhenTrue().asKind(SyntaxKind.ParenthesizedExpression).getExpression().getText();

// Inject waitlist into Settings
// settingsMotionDivText has className="max-w-3xl mx-auto space-y-8">
const settingsTarget = `className="max-w-3xl mx-auto space-y-8">`;
const settingsTargetIdx = settingsMotionDivText.indexOf(settingsTarget) + settingsTarget.length;
settingsMotionDivText = settingsMotionDivText.substring(0, settingsTargetIdx) + "\n" + waitlistSection + "\n" + settingsMotionDivText.substring(settingsTargetIdx);


// 4. Create new tabs
const overviewTab = `{activeTab === "dashboard" && (
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
        )}`;

const applicationsTab = `{activeTab === "applications" && (
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
            <div className="space-y-8">
              ${savedSection}
            </div>
          </motion.div>
        )}`;

const hoursTab = `{activeTab === "hours" && (
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

const leaderboardTab = `{activeTab === "leaderboard" && (
          ${lbMotionDiv}
        )}`;

const settingsTab = `{activeTab === "settings" && (
          ${settingsMotionDivText}
        )}`;

const newAnimatePresence = `<AnimatePresence mode="wait">
        ${overviewTab}
        ${applicationsTab}
        ${hoursTab}
        ${leaderboardTab}
        ${settingsTab}
      </AnimatePresence>`;

// Replace return statement entirely
const newReturn = `  const sidebarItems = [
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
      ${newAnimatePresence}
      {showReceiptModal && selectedReceiptApp && (
        <ReceiptModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          application={selectedReceiptApp}
        />
      )}
      {showPrintModal && selectedReceiptApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="bg-white max-w-3xl w-full my-auto rounded-xl shadow-card relative border-none print:shadow-none print:max-w-none print:m-0">
            <div className="p-8 md:p-12 space-y-8 print:p-0">
              <div className="border-b-4 border-blue-dark pb-5 text-center sm:text-left">
                <h2 className="text-3xl font-display font-bold text-ink tracking-tight">Official Verification Certificate</h2>
                <p className="text-ink-soft text-[15px] mt-1.5 font-medium">Generated securely by Volunteer NY System</p>
              </div>
              <div className="bg-paper-2/70 border border-line p-6 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-ink-muted uppercase font-semibold tracking-wider mb-1">Student</p>
                  <p className="font-semibold text-ink text-sm">{studentProfile?.fullName}</p>
                </div>
                <div>
                  <p className="text-ink-muted uppercase font-semibold tracking-wider mb-1">Organization</p>
                  <p className="font-semibold text-ink text-sm">{selectedReceiptApp.organizationName || "Community Organization"}</p>
                </div>
                <div>
                  <p className="text-ink-muted uppercase font-semibold tracking-wider mb-1">Date Logged</p>
                  <p className="font-medium text-ink">{formatDate(selectedReceiptApp.verifiedAt?.toDate() || selectedReceiptApp.updatedAt?.toDate() || selectedReceiptApp.appliedAt?.toDate())}</p>
                </div>
                <div>
                  <p className="text-ink-muted uppercase font-semibold tracking-wider mb-1">Certificate ID</p>
                  <p className="font-mono text-ink bg-white px-2 py-0.5 rounded border border-line/50 inline-block">{selectedReceiptApp.id.toUpperCase()}</p>
                </div>
              </div>
              <div className="overflow-x-auto border border-line rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-paper-2 border-b border-line">
                      <th className="px-4 py-3 font-semibold text-ink">Role / Activity</th>
                      <th className="px-4 py-3 font-semibold text-ink text-right">Hours Logged</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-4 font-medium text-ink border-b border-line">{selectedReceiptApp.roleTitle || "Volunteer"}</td>
                      <td className="px-4 py-4 font-semibold text-ink text-right border-b border-line">{selectedReceiptApp.verifiedHours || 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="text-right text-sm md:text-base font-semibold text-ink flex justify-end gap-2 items-center">
                <span>Total Verified Hours:</span>
                <span className="text-xl font-bold text-blue-dark">{selectedReceiptApp.verifiedHours || 0}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-line">
                <div>
                  <div className="h-10 border-b border-line mb-2"></div>
                  <p className="text-xs text-ink-soft font-semibold">Student Signature</p>
                </div>
                <div>
                  <div className="h-10 border-b border-line mb-2 flex items-end"><span className="text-green-600 font-medium text-xs mb-1">? Electronically Verified</span></div>
                  <p className="text-xs text-ink-soft font-semibold">Organization Authorization</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4 bg-paper p-6 rounded-b-xl border-t border-line print:hidden">
              <Button variant="outline" className="px-5 h-11 text-xs uppercase text-ink-soft font-semibold hover:bg-paper-3 rounded-lg" onClick={() => setShowPrintModal(false)}>Close Certificate</Button>
              <Button className="px-5 h-11 text-xs uppercase bg-blue-dark hover:bg-blue-dark font-semibold text-white rounded-lg cursor-pointer flex items-center gap-1.5" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print Document</Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );`

returnStmt.replaceWithText(newReturn);

sourceFile.saveSync();
console.log("Successfully rebuilt the StudentDashboard!");

