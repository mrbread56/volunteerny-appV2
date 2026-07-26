const fs = require('fs');

const files = [
  'C:/Users/ASUS/Downloads/volunteerny_final/src/pages/StudentDashboard.tsx',
  'C:/Users/ASUS/Downloads/volunteerny_final/src/pages/OrgDashboard.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace text-4xl font-black with text-4xl font-mono font-medium
    content = content.replace(/text-(3xl|4xl|5xl) font-(black|extrabold|bold)/g, 'text-$1 font-mono font-medium');
    
    fs.writeFileSync(file, content);
  }
});
console.log('Applied font-mono to dashboard stats');
