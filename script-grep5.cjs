const fs = require('fs');
['C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/StudentDashboard.tsx', 'C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/OrgDashboard.tsx'].forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/.*fontinally.*/g) || [];
    console.log('--- ' + filePath + ' ---');
    console.log(matches.join('\n'));
});
