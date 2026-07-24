const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const replacement = `
      // 1. First, check Firebase Custom Claims
      const userRecord = await adminInstance.auth().getUser(uid);
      const authorizedDevs = (process.env.VITE_DEVELOPER_EMAILS || '').split(',').map(e => e.trim());
      if (userRecord.email && authorizedDevs.includes(userRecord.email)) {
        return 'developer';
      }

      if (userRecord.customClaims && userRecord.customClaims.role) {
`;

content = content.replace(`      // 1. First, check Firebase Custom Claims
      const userRecord = await adminInstance.auth().getUser(uid);
      if (userRecord.customClaims && userRecord.customClaims.role) {`, replacement);

fs.writeFileSync('server.ts', content);
