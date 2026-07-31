
const fs = require("fs");
let content = fs.readFileSync("src/pages/StudentDashboard.tsx", "utf8");

content = content.replace(/\{isMostRecent \? \"[^"\[]+\[MOST RECENT\] \" \: \"\"\}/g, "{isMostRecent ? \"[MOST RECENT] \" : \"\"}");

content = content.replace(/<option value=\"custom\" className=\"font-bold text-amber-700\">[^A-Za-z0-9]+Other \/ Unlisted Custom Activity Name\.\.\.<\/option>/g, "<option value=\"custom\" className=\"font-bold text-amber-700\">Other / Unlisted Custom Activity Name...</option>");

content = content.replace(/<option value=\"custom\" className=\"font-bold text-amber-700\">[^A-Za-z0-9]+Other \/ Unlisted Organization \(Enter Manually\)\.\.\.<\/option>/g, "<option value=\"custom\" className=\"font-bold text-amber-700\">Other / Unlisted Organization (Enter Manually)...</option>");

content = content.replace(/<span className=\"text-ink font-extrabold tracking-wide \">/g, "<span className=\"text-ink font-black tracking-wide \">");
content = content.replace(/<span className=\"text-blue-dark font-extrabold \">/g, "<span className=\"text-blue-dark font-black text-lg \">");

fs.writeFileSync("src/pages/StudentDashboard.tsx", content);
console.log("Fixed emojis and bolding");

