const fs = require('fs');
let content = fs.readFileSync('src/firebase/config.ts', 'utf8');

// remove imports
content = content.replace(", setPersistence, inMemoryPersistence", "");

// remove block
const persistenceBlock = /\/\/ CRITICAL FIX: Bypass the AI Studio Iframe block\nsetPersistence\(auth, inMemoryPersistence\)\n  \.then\(\(\) => console\.log\("Firebase Auth forced to In-Memory Persistence"\)\)\n  \.catch\(\(e\) => console\.error\("Persistence error:", e\)\);/g;

content = content.replace(persistenceBlock, "");

fs.writeFileSync('src/firebase/config.ts', content);
