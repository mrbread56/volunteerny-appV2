const fs = require('fs');
let content = fs.readFileSync('src/pages/Signup.tsx', 'utf8');

const regex = /<Button\n\s*className="w-full h-18 text-xl font-black uppercase tracking-widest rounded-3xl transition-all shadow-2xl bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 cursor-pointer"\n\s*onClick=\{handleGoogleSignup\}[\s\S]*?Sign up with Google\n\s*<\/Button>\n\s*<Button\n\s*variant="outline"\n\s*className="w-full h-18 text-sm font-black uppercase tracking-widest rounded-3xl transition-all border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-inner cursor-pointer"\n\s*onClick=\{([^}]*)\}\n\s*>\n\s*Continue with Email & Password\n\s*<\/Button>\n\s*<p className="text-center text-\[10px\] font-black text-blue-600 uppercase tracking-widest animate-pulse">\n\s*Ready to continue as \{role\}\n\s*<\/p>/;

if (content.match(regex)) {
  content = content.replace(regex, `<Button
                  className="w-full h-18 text-xl font-black uppercase tracking-widest rounded-3xl transition-all shadow-2xl bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 cursor-pointer"
                  onClick={$1}
                >
                  Ready to continue
                </Button>`);
} else {
  console.log("Failed to match Signup.tsx UI regex.");
}

// remove infinite loading
const effectRegex = /React\.useEffect\(\(\) => \{\n\s*setIsGoogleLoading\(true\);\n\s*\/\* redirect check removed \*\/\n\s*\}, \[\]\);/g;
content = content.replace(effectRegex, '');

// remove handleGoogleSignup function
const handleGoogleRegex = /const handleGoogleSignup = async \(\) => \{[\s\S]*?\n  \};\n/g;
content = content.replace(handleGoogleRegex, '');

fs.writeFileSync('src/pages/Signup.tsx', content);

