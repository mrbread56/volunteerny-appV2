const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Add imports
content = content.replace('import { ShieldCheck, AlertCircle } from "lucide-react";', 'import { ShieldCheck, AlertCircle, Play } from "lucide-react";\nimport { enableDemoMode } from "../contexts/AuthContext";');

// Add state
content = content.replace('const [isGoogleLoading, setIsGoogleLoading] = useState(false);', 'const [isGoogleLoading, setIsGoogleLoading] = useState(false);\n  const [isDemoLoading, setIsDemoLoading] = useState(false);');

// Add buttons
const demoButtons = `
            {/* Demo Mode */}
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-xs text-center text-slate-400 mb-3 font-medium">Try without an account</p>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => { setIsDemoLoading(true); try { await enableDemoMode('student'); navigate('/'); } catch { setError('Demo unavailable'); } finally { setIsDemoLoading(false); } }}
                  isLoading={isDemoLoading}
                  className="h-10 text-xs font-bold"
                >
                  <Play className="w-3 h-3 mr-1.5" />
                  Demo as Student
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => { setIsDemoLoading(true); try { await enableDemoMode('organization'); navigate('/'); } catch { setError('Demo unavailable'); } finally { setIsDemoLoading(false); } }}
                  isLoading={isDemoLoading}
                  className="h-10 text-xs font-bold"
                >
                  <Play className="w-3 h-3 mr-1.5" />
                  Demo as Org
                </Button>
              </div>
            </div>
`;

content = content.replace('</button>\n            )}', '</button>\n            )}\n' + demoButtons);

fs.writeFileSync('src/pages/Login.tsx', content, 'utf8');
console.log("Patched Login.tsx");
