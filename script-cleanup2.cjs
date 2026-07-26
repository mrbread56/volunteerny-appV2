const fs = require('fs');
['C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/StudentDashboard.tsx', 'C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/OrgDashboard.tsx'].forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/text-slate-800/g, 'text-ink');
    content = content.replace(/border-slate-300/g, 'border-line');
    fs.writeFileSync(filePath, content);
});
