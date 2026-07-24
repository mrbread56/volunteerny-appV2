import os
import re

directory = r"C:\Users\ASUS\Downloads\volunteerny_final\src"

# Premium design system replacements
replacements = [
    # Typography: kill brutalism
    (r'\bfont-black\b', 'font-bold'),
    (r'\bfont-extrabold\b', 'font-bold'),
    (r'\buppercase tracking-widest\b', 'tracking-wide'),
    (r'\buppercase tracking-\[0\.3em\]\b', 'tracking-wider'),
    (r'\buppercase tracking-\[0\.2em\]\b', 'tracking-wider'),
    
    # Border radius: premium not bubbly
    (r'\brounded-\[2\.5rem\]\b', 'rounded-xl'),
    (r'\brounded-\[2rem\]\b', 'rounded-xl'),
    (r'\brounded-\[3rem\]\b', 'rounded-xl'),
    (r'\brounded-3xl\b', 'rounded-xl'),
    
    # Shadows: use system
    (r'\bshadow-2xl\b', 'shadow-card'),
    
    # Headings: use primary-950
    (r'\btext-slate-900\b(?![\w-])', 'text-primary-950'),
    
    # Any remaining raw blue/indigo/orange (comprehensive)
    (r'\bbg-blue-50\b', 'bg-primary-50'),
    (r'\bbg-blue-100\b', 'bg-primary-100'),
    (r'\bbg-blue-200\b', 'bg-primary-200'),
    (r'\bbg-blue-300\b', 'bg-primary-300'),
    (r'\bbg-blue-400\b', 'bg-primary-400'),
    (r'\bbg-blue-500\b', 'bg-primary-500'),
    (r'\bbg-blue-600\b', 'bg-primary-600'),
    (r'\bbg-blue-700\b', 'bg-primary-700'),
    (r'\bbg-blue-800\b', 'bg-primary-800'),
    (r'\bbg-blue-900\b', 'bg-primary-900'),
    (r'\btext-blue-100\b', 'text-primary-100'),
    (r'\btext-blue-200\b', 'text-primary-200'),
    (r'\btext-blue-300\b', 'text-primary-300'),
    (r'\btext-blue-400\b', 'text-primary-400'),
    (r'\btext-blue-500\b', 'text-primary-500'),
    (r'\btext-blue-600\b', 'text-primary-600'),
    (r'\btext-blue-700\b', 'text-primary-700'),
    (r'\btext-blue-800\b', 'text-primary-800'),
    (r'\btext-blue-900\b', 'text-primary-900'),
    (r'\bborder-blue-100\b', 'border-primary-100'),
    (r'\bborder-blue-200\b', 'border-primary-200'),
    (r'\bborder-blue-300\b', 'border-primary-300'),
    (r'\bborder-blue-500\b', 'border-primary-500'),
    (r'\bborder-blue-600\b', 'border-primary-600'),
    (r'\bring-blue-500\b', 'ring-primary-500'),
    (r'\bring-blue-600\b', 'ring-primary-600'),
    (r'\bshadow-blue-\d+', 'shadow-primary-200'),
    (r'\bshadow-indigo-\d+', 'shadow-primary-200'),
    (r'\bhover:bg-blue-700\b', 'hover:bg-primary-800'),
    (r'\bhover:bg-blue-600\b', 'hover:bg-primary-700'),
    (r'\bhover:text-blue-\d+\b', 'hover:text-primary-700'),
    (r'\bfocus:border-blue-\d+\b', 'focus:border-primary-500'),
    (r'\bfocus:ring-blue-\d+\b', 'focus:ring-primary-500'),
    (r'\bfrom-blue-\d+\b', 'from-primary-600'),
    (r'\bto-blue-\d+\b', 'to-primary-700'),
    (r'\bvia-blue-\d+\b', 'via-primary-500'),
    (r'\bfrom-indigo-\d+\b', 'from-primary-500'),
    (r'\bto-indigo-\d+\b', 'to-primary-700'),
    (r'\bvia-indigo-\d+\b', 'via-primary-500'),
    (r'\bbg-indigo-\d+\b', 'bg-primary-100'),
    (r'\btext-indigo-\d+\b', 'text-primary-600'),
    (r'\bborder-indigo-\d+\b', 'border-primary-200'),
    (r'\bhover:text-indigo-\d+\b', 'hover:text-primary-600'),
    (r'\bbg-orange-\d+\b', 'bg-accent-500'),
    (r'\btext-orange-\d+\b', 'text-accent-500'),
    (r'\bhover:bg-orange-\d+\b', 'hover:bg-accent-600'),
    (r'\bborder-orange-\d+\b', 'border-accent-200'),
    (r'\bfrom-orange-\d+\b', 'from-accent-500'),
    (r'\bto-orange-\d+\b', 'to-accent-500'),
    
    # Partial opacity variants  
    (r'\bbg-blue-\d+/\d+\b', 'bg-primary-500/20'),
    (r'\bborder-blue-\d+/\d+\b', 'border-primary-500/20'),
    (r'\bshadow-blue-\d+/\d+\b', 'shadow-primary-500/10'),
    (r'\bshadow-indigo-\d+/\d+\b', 'shadow-primary-200/50'),
    (r'\bbg-orange-\d+/\d+\b', 'bg-accent-500/20'),
    (r'\bbg-indigo-\d+/\d+\b', 'bg-primary-100/20'),
]

count = 0
for root, _, files in os.walk(directory):
    for file in files:
        if not (file.endswith(".tsx") or file.endswith(".ts")):
            continue
        # Skip files we've already fully rewritten
        if file in ('Button.tsx', 'Card.tsx', 'Badge.tsx', 'Input.tsx', 'Home.tsx', 'Login.tsx', 'Footer.tsx', 'DashboardLayout.tsx'):
            continue
        path = os.path.join(root, file)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        
        new_content = content
        for pattern, replacement in replacements:
            new_content = re.sub(pattern, replacement, new_content)
            
        if new_content != content:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
            count += 1
            print(f"  Fixed: {os.path.relpath(path, directory)}")

print(f"\nDone. Updated {count} files.")
