const fs = require('fs');
function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    /'. ALSO ensure you have a Support Email configured in the project settings.',/g,
    '\'. ALSO ensure you have a Support Email configured in the project settings. Note: Changes can take 5-10 minutes to propagate.\','
  );
  fs.writeFileSync(filePath, content);
}
fixFile('src/pages/Login.tsx');
fixFile('src/pages/Signup.tsx');
