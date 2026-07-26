const fs = require('fs');
let content = fs.readFileSync('src/firebase/config.ts', 'utf8');
content = content.replace(
  "export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);",
  "import { initializeFirestore } from 'firebase/firestore';\nexport const db = initializeFirestore(app, { experimentalForceLongPolling: true }, (firebaseConfig as any).firestoreDatabaseId);"
);
fs.writeFileSync('src/firebase/config.ts', content);
