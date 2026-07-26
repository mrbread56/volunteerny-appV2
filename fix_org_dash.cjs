const fs = require('fs');
let content = fs.readFileSync('src/pages/OrgDashboard.tsx', 'utf8');
content = content.replace(/studentEmail = "kiamehrmetanat@gmail\.com"/g, 'studentEmail = "student@example.com"');
fs.writeFileSync('src/pages/OrgDashboard.tsx', content);
