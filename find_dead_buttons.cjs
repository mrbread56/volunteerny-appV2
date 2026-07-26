const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Match `<Button` or `<button` until `>`
  const matches = content.match(/<[bB]utton[^>]*>/g);
  let hasPrinted = false;
  
  if (matches) {
    matches.forEach(match => {
      // It's just matching the opening tag, so if onClick is on another line, it might fail to catch it if there are newlines inside the tag.
      // Better regex for matching tags including newlines:
    });
  }
  
  const matchesMultiline = content.match(/<[bB]utton[\s\S]*?>/g);
  if (matchesMultiline) {
      matchesMultiline.forEach(match => {
         if (!match.includes('onClick') && !match.includes('type="submit"') && !match.includes('type="button"')) {
             if (!hasPrinted) {
                 console.log(`\n--- ${file} ---`);
                 hasPrinted = true;
             }
             console.log(match);
         }
      });
  }
});
