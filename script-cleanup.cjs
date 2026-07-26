const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Handle rounded-sm -> rounded-lg except w-2.5 h-2.5
    content = content.replace(/w-2\.5 h-2\.5.*?rounded-sm/g, match => match.replace('rounded-sm', 'ROUNDED_SM_TEMP'));
    content = content.replace(/\brounded-sm\b/g, 'rounded-lg');
    content = content.replace(/ROUNDED_SM_TEMP/g, 'rounded-sm');

    // Handle uppercase tracking-widest
    // We replace it with 	racking-wide and remove uppercase, or just remove both.
    // The prompt says "Remove aggressive uppercase tracking-widest from standard section headers (keep only on tiny status Badges)"
    // and "Replace uppercase tracking-widest with nothing or tracking-wide on section headers"
    // So let's replace "uppercase tracking-widest" with "tracking-wide" except if the line contains "text-[8px]" or "Badge"
    
    let lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('uppercase tracking-widest')) {
            if (!lines[i].includes('text-[8px]') && !lines[i].includes('Badge')) {
                lines[i] = lines[i].replace(/\buppercase tracking-widest\b/g, 'tracking-wide');
                lines[i] = lines[i].replace(/\buppercase\b(?=.*tracking-wide)/g, ''); // in case they were separated, but they are usually together
            }
        }
    }
    content = lines.join('\n');

    fs.writeFileSync(filePath, content);
}

processFile('C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/StudentDashboard.tsx');
processFile('C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/OrgDashboard.tsx');
