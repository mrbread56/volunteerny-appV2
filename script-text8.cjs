const fs = require('fs');
['C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/StudentDashboard.tsx', 'C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/OrgDashboard.tsx'].forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/text-\[8px\]/g, 'text-xs');
    fs.writeFileSync(filePath, content);
});
