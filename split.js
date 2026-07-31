
const fs = require("fs");
let content = fs.readFileSync("src/pages/StudentDashboard.tsx", "utf8");

function extractBetween(str, startStr, endStr) {
    const startIndex = str.indexOf(startStr);
    if (startIndex === -1) return "";
    const endIndex = str.indexOf(endStr, startIndex);
    if (endIndex === -1) return "";
    return str.substring(startIndex, endIndex);
}

// 1. Extract Apps
const appsSection = extractBetween(content, "{/* Recent Applications */}", "{/* Recommended Opportunities */}");

// 2. Extract Recs
const recsSection = extractBetween(content, "{/* Recommended Opportunities */}", "</div>\n\n            {/* Right Sidebar */}");
// Wait, the comment is {/* Sidebar */} or {/* Right Sidebar */}?
// In the python script I had `{/* Sidebar */}`. Let's just use `<div className=\"space-y-8\">`
const recsSectionAlt = extractBetween(content, "{/* Recommended Opportunities */}", "</div>\n            {/* Sidebar");

// 3. Extract Hours
const hoursSection = extractBetween(content, "{/* Hour Tracker Gauge */}", "{/* Interest Matching / Waiting List in Sidebar */}");

// 4. Extract Waitlist
const waitlistSection = extractBetween(content, "{/* Interest Matching / Waiting List in Sidebar */}", "<section>\n              <h2 className=\"text-xl");

// 5. Extract Saved
const savedSection = extractBetween(content, "<h2 className=\"text-xl font-bold text-ink mb-4 flex items-center gap-2\">\n                <Star", "</section>\n            </div>\n          </motion.div>");
// Note: need to include the `<section>` tag for saved if it's missing.

console.log("Apps length:", appsSection.length);
console.log("Recs length:", recsSectionAlt.length);
console.log("Hours length:", hoursSection.length);
console.log("Waitlist length:", waitlistSection.length);
console.log("Saved length:", savedSection.length);

