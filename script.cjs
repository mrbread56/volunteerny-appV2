const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');
const m = content.match(/"([A-Z][^"]{20,100}?)"/g);
if (m) console.log([...new Set(m)].slice(0, 50).join('\n'));
