const fs = require('fs');
let content = fs.readFileSync('src/pages/Home.tsx', 'utf8');

// It's a JSON encoded string, so we need to JSON.parse it!
try {
  if (content.trim().startsWith('"') && content.trim().endsWith('"')) {
    content = JSON.parse(content);
    fs.writeFileSync('src/pages/Home.tsx', content, 'utf8');
    console.log("Successfully unescaped Home.tsx!");
  } else {
    console.log("Home.tsx doesn't look like an escaped JSON string.");
  }
} catch (e) {
  console.error("Failed to parse Home.tsx:", e.message);
  
  // fallback for multi-escaped strings
  try {
     let unescaped = content.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
     fs.writeFileSync('src/pages/Home.tsx', unescaped, 'utf8');
     console.log("Successfully unescaped Home.tsx using regex fallback!");
  } catch (e2) {
     console.error("Fallback failed:", e2.message);
  }
}
