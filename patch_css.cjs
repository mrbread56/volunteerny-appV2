const fs = require('fs');
let content = fs.readFileSync('C:/Users/ASUS/Downloads/volunteerny_final/src/index.css', 'utf8');

// Replace the @import URL
content = content.replace(
  "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');",
  "@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400;1,9..144,500;1,9..144,600;1,9..144,700&family=Work+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');"
);

// Add the font variables
const fontVars = `
  /* Typography */
  --font-display: "Fraunces", Georgia, serif;
  --font-sans: "Archivo", system-ui, sans-serif;
  --font-serif: "Fraunces", Georgia, serif;
`;

if (!content.includes('--font-display')) {
  content = content.replace(
    '  --font-sans: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;',
    fontVars
  );
}

fs.writeFileSync('C:/Users/ASUS/Downloads/volunteerny_final/src/index.css', content);
console.log('Successfully patched index.css');
