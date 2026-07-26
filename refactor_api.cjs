const fs = require('fs');
const glob = require('glob'); // Not available? I'll use simple fs recurse

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes("fetch('/api/") || content.includes('fetch("/api/')) {
    
    // Check if it already imports API_BASE_URL
    if (!content.includes('API_BASE_URL')) {
      // Find import line
      const importLine = `import { API_BASE_URL } from "${filePath.split('/').length > 3 ? '../..' : '..'}//lib/config";\n`.replace('//', '/');
      // Wait, let's just do it dynamically based on depth.
      const depth = filePath.split(/[/\\]/).length - 2; // e.g. src/pages/Feedback.tsx -> depth 1. src/components/ReportModal.tsx -> depth 1.
      const prefix = depth === 1 ? '../' : depth === 2 ? '../../' : './';
      content = `import { API_BASE_URL } from "${prefix}lib/config";\n` + content;
    }
    
    content = content.replace(/fetch\(['"]\/api\//g, 'fetch(`${API_BASE_URL}/api/');
    content = content.replace(/fetch\(\`\/api\//g, 'fetch(`${API_BASE_URL}/api/');
    // Handle the closing quote properly.
    // Wait, the regex replaced fetch('/api/ with fetch(`${API_BASE_URL}/api/
    // But the end quote is still there! 
    // E.g. fetch('/api/email/send', ...) -> fetch(`${API_BASE_URL}/api/email/send', ...) -> invalid syntax!
  }
}
