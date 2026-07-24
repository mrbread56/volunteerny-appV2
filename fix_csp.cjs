const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com;",
  "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://apis.google.com;"
);

content = content.replace(
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;"
);

// Frame src already has volunteer-ny.firebaseapp.com in the actual file, let's just make sure it's correct.
// let's do a more robust replace for frame-src
content = content.replace(
  /frame-src 'self' https:\/\/www\.google\.com( https:\/\/volunteer-ny\.firebaseapp\.com)?;/g,
  "frame-src 'self' https://www.google.com https://volunteer-ny.firebaseapp.com;"
);

fs.writeFileSync('server.ts', content);
