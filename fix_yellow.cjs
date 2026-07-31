
const fs = require("fs");
let content = fs.readFileSync("src/pages/StudentDashboard.tsx", "utf8");

content = content.replace("className=\"px-3 py-1.5 text-xs font-semibold tracking-wide bg-amber/10 hover:bg-amber/10 text-amber border border-amber/20 rounded-lg flex items-center gap-1 hover:scale-[1.03] transition-all duration-200 whitespace-nowrap rounded-full\"", "className=\"px-3 py-1.5 text-xs font-semibold tracking-wide bg-white hover:bg-paper-3 text-ink border border-line rounded-lg flex items-center gap-1 hover:scale-[1.03] transition-all duration-200 whitespace-nowrap rounded-full shadow-sm\"");

content = content.replace("<div className=\"bg-amber/10 border border-amber/20 rounded-lg p-5 text-center space-y-3\">", "<div className=\"bg-white border border-line rounded-lg p-5 text-center space-y-3 shadow-sm\">");

content = content.replace("<span className=\"text-xs font-semibold tracking-wide text-amber bg-amber/10 px-3 py-1 rounded-lg border border-orange-100\">", "<span className=\"text-xs font-semibold tracking-wide text-ink-soft bg-paper-3 px-3 py-1 rounded-lg border border-line\">");

content = content.replace("className=\"w-full h-10 bg-amber hover:bg-amber hover:scale-[1.02] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all gap-1.5 cursor-pointer\"", "className=\"w-full h-10 bg-blue-dark hover:bg-blue-dark hover:scale-[1.02] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all gap-1.5 cursor-pointer\"");

fs.writeFileSync("src/pages/StudentDashboard.tsx", content);
console.log("Yellow backgrounds removed");

