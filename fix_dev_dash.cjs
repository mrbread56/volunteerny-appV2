const fs = require('fs');
let content = fs.readFileSync('src/pages/DeveloperDashboard.tsx', 'utf8');
content = content.replace(
  /const isTargetDev = students\.find\(s => s\.uid === userId\)\?\.email === 'kiamehrmetanat@gmail\.com' \|\|[\s\S]*?orgs\.find\(o => o\.uid === userId\)\?\.contactEmail === 'kiamehrmetanat@gmail\.com';/,
  `const targetStudentEmail = students.find(s => s.uid === userId)?.email || '';\n        const targetOrgEmail = orgs.find(o => o.uid === userId)?.contactEmail || '';\n        const isTargetDev = AUTHORIZED_DEVS.includes(targetStudentEmail) || AUTHORIZED_DEVS.includes(targetOrgEmail);`
);
content = content.replace(/useState\(user\?\.email \|\| 'kiamehrmetanat@gmail\.com'\)/g, "useState(user?.email || 'developer@example.com')");
fs.writeFileSync('src/pages/DeveloperDashboard.tsx', content);
