import fs from 'fs';
import path from 'path';

function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getFilesRecursively('./src');
const issues: { file: string; line: number; type: string; info: string }[] = [];

files.forEach(file => {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Check for standard unclosed tags or syntax oddities on buttons
    if (lower.includes('<button') || lower.includes('<button ') || lower.includes('<button\n') || lower.includes('<button\r') || lower.includes('<button\t')) {
       // Check if there is NO onClick handle and it is not a submit button inside forms
       if (!lower.includes('onclick') && !lower.includes('type="submit"') && !lower.includes('type=\'submit\'')) {
         // Some buttons are container click triggers (e.g., custom wrappers or fields)
         // But plain buttons without onClick are suspicious as they do absolutely nothing
         issues.push({
           file,
           line: idx + 1,
           type: 'Button tag without onClick handler or submit type',
           info: trimmed
         });
       }
    }

    // Check custom UI <Button elements in the exact same format
    if (trimmed.includes('<Button') || trimmed.includes('<Button ') || trimmed.includes('<Button\n') || trimmed.includes('<Button\r') || trimmed.includes('<Button\t')) {
       // Look for missing action
       if (!lower.includes('onclick') && !lower.includes('type="submit"') && !lower.includes('type=\'submit\'') && !lower.includes('aschild') && !lower.includes('disabled')) {
         issues.push({
           file,
           line: idx + 1,
           type: 'Custom <Button> without onClick, submit asChild, or disabled state',
           info: trimmed
         });
       }
    }

    // Check for hashtags placeholders in standard React Link elements
    if ((lower.includes('<link') || lower.includes('to=')) && (
      lower.includes('to="#"') || 
      lower.includes('to=\'#\'') || 
      lower.includes('to={#}') ||
      lower.includes('to={"#"}')
    )) {
      issues.push({
        file,
        line: idx + 1,
        type: 'Link component pointing to empty hashtag "#"',
        info: trimmed
      });
    }

    // Check for javascript:void(0) or empty links representing fake buttons
    if (lower.includes('href=') && (
      lower.includes('href="#"') || 
      lower.includes('href=\'#\'') || 
      lower.includes('javascript:void(0)')
    )) {
      if (!lower.includes('facebook') && !lower.includes('twitter') && !lower.includes('linkedin') && !lower.includes('instagram')) {
        issues.push({
          file,
          line: idx + 1,
          type: 'Anchor element used as placeholder button button (empty href)',
          info: trimmed
        });
      }
    }
  });
});

console.log(`REPORT: Audited ${files.length} source files. Found exactly ${issues.length} potential functional/placeholder issues:`);
issues.forEach((issue, index) => {
  console.log(`\n[ISSUE #${index + 1}]`);
  console.log(`  File: ${issue.file}:${issue.line}`);
  console.log(`  Type: ${issue.type}`);
  console.log(`  Code: ${issue.info}`);
});
