const stateStr = Buffer.from(JSON.stringify({ redirectUri: 'https://example.com/callback' })).toString('base64');
console.log(stateStr);
const parsed = JSON.parse(Buffer.from(stateStr, 'base64').toString('utf8'));
console.log(parsed.redirectUri);
