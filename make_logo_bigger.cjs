const fs = require('fs');

function replaceSize(filePath, fromSize, toSize) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(fromSize, toSize);
  fs.writeFileSync(filePath, content);
}

replaceSize('src/components/layout/Navbar.tsx', 'className="w-10 h-10', 'className="w-16 h-16');
replaceSize('src/App.tsx', 'className="w-8 h-8', 'className="w-12 h-12');
