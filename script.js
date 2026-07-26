const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Tokens
    content = content.replace(/text-slate-900/g, 'text-ink');
    content = content.replace(/text-slate-950/g, 'text-ink');
    content = content.replace(/text-slate-700/g, 'text-ink-soft');
    content = content.replace(/text-slate-600/g, 'text-ink-soft');
    content = content.replace(/text-slate-500/g, 'text-ink-soft');
    content = content.replace(/text-slate-400/g, 'text-ink-muted');
    content = content.replace(/text-slate-300/g, 'text-ink-muted');
    content = content.replace(/bg-slate-50(?!0)/g, 'bg-paper-2');
    content = content.replace(/bg-slate-100/g, 'bg-paper-3');
    content = content.replace(/border-slate-100/g, 'border-line');
    content = content.replace(/border-slate-200/g, 'border-line');
    content = content.replace(/border-slate-50(?!0)/g, 'border-line-light');
    content = content.replace(/shadow-slate-[a-z0-9\-]+/g, '');

    // Typography
    content = content.replace(/font-black/g, 'font-semibold');
    content = content.replace(/font-extrabold/g, 'font-semibold');
    content = content.replace(/text-\[10px\]/g, 'text-xs');
    content = content.replace(/text-\[9\.5px\]/g, 'text-xs');
    content = content.replace(/text-\[9px\]/g, 'text-xs');
    content = content.replace(/text-\[11px\]/g, 'text-xs');

    // Spacing
    content = content.replace(/p-10 md:p-14/g, 'p-6 sm:p-8');
    content = content.replace(/\bh-18\b/g, 'h-11');
    // We will handle rounded-sm manually or carefully
    // We will handle uppercase tracking-widest carefully

    // Syntax bug
    content = content.replace(/\} fontinally \{/g, '} finally {');
    content = content.replace(/font-medium finally/g, 'finally');

    fs.writeFileSync(filePath, content);
}

processFile('C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/StudentDashboard.tsx');
processFile('C:/Users/ASUS/Downloads/vnyv6-restored/vny6/src/pages/OrgDashboard.tsx');
