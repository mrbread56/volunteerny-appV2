const fs = require('fs');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('const isIframe')) {
    content = content.replace(
      'const navigate = useNavigate();',
      'const navigate = useNavigate();\n  const isIframe = window !== window.top;'
    );
    
    content = content.replace(
      '<Button\n                  type="button"\n                  variant="outline"\n                  className="w-full h-11"\n                  onClick={handleGoogleLogin}\n                  disabled={isGoogleLoading || isLoading}',
      '{isIframe && <p className="text-xs text-red-500 mb-2 font-medium">⚠️ Google Sign-In may fail inside the preview window. Click the arrow icon at the top right to open the app in a new tab first.</p>}\n                <Button\n                  type="button"\n                  variant="outline"\n                  className="w-full h-11"\n                  onClick={handleGoogleLogin}\n                  disabled={isGoogleLoading || isLoading}'
    );
    
    fs.writeFileSync(filePath, content);
  }
}

fixFile('src/pages/Login.tsx');
fixFile('src/pages/Signup.tsx');
