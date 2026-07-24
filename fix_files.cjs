const fs = require('fs');
['src/pages/Home.tsx', 'src/index.css'].forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // It's wrapped in quotes and escaped. JSON.parse will unescape it if it's a valid JSON string.
  try {
    const unescaped = JSON.parse(content);
    fs.writeFileSync(file, unescaped, 'utf8');
  } catch (e) {
    console.error("Failed to parse", file, e.message);
    // If it's not valid JSON, maybe just manually unescape it
    if (content.startsWith('"') && content.endsWith('"')) {
       let unescaped = content.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
       fs.writeFileSync(file, unescaped, 'utf8');
    }
  }
});
