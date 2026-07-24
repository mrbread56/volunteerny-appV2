const fs = require('fs');

// Patch Home.tsx
let content = fs.readFileSync('C:/Users/ASUS/Downloads/volunteerny_final/src/pages/Home.tsx', 'utf8');
const lines = content.split('\n');

const customHero = `        <div className="relative max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
             
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-primary-950 tracking-tight leading-[1.1] mb-6">
              Your community{' '}
              <span className="font-display italic text-[#1F4C63]">needs</span>{' '}you.
              <br />
              <span className="font-display italic bg-gradient-to-r from-[#1F4C63] to-[#E08A3C] bg-clip-text text-transparent">Find where you belong.</span>
            </h1>
            
            <p className="text-lg text-slate-600 max-w-xl leading-relaxed mb-10">
              Volunteer North York connects high school students with trusted nonprofits. Build skills, fulfill hours, and make a real impact in your neighborhood.
            </p>
            
            <div className="flex flex-wrap items-center gap-4">
              {user ? (
                <Link to={userProfile?.role === 'student' ? '/student/dashboard' : '/org/dashboard'}>
                  <Button size="lg" className="h-12 px-8 text-[15px]">
                     Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/student/opportunities">
                    <Button size="lg" className="h-12 px-8 text-[15px] bg-[#1F4C63] hover:bg-[#1F4C63]/90 text-white border-0 shadow-lg shadow-[#1F4C63]/20">
                      Explore Opportunities <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Link to="/signup">
                    <Button size="lg" variant="ghost" className="h-12 px-6 text-slate-600 hover:bg-slate-100">
                      For Organizations
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </motion.div>
          <div className="relative lg:ml-auto w-full max-w-md hidden lg:block">
             <ScrollLeaf />
          </div>
        </div>`;

// Inject the import
const importStr = "import ScrollLeaf from '../components/ScrollLeaf';";
if (!lines.some(l => l.includes('ScrollLeaf'))) {
   lines.splice(2, 0, importStr);
}

// Find hero bounds
const startIdx = lines.findIndex(l => l.includes('max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'));
const endIdx = lines.findIndex((l, idx) => idx > startIdx && l.includes('</section>'));

if (startIdx !== -1 && endIdx !== -1) {
   const before = lines.slice(0, startIdx);
   const after = lines.slice(endIdx);
   const newLines = [...before, customHero, ...after];
   fs.writeFileSync('C:/Users/ASUS/Downloads/volunteerny_final/src/pages/Home.tsx', newLines.join('\n'));
   console.log('Successfully patched Home.tsx');
} else {
   console.log('Failed to find bounds:', startIdx, endIdx);
}
