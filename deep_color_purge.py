import os
import re

directory = r"C:\Users\ASUS\Downloads\volunteerny_final\src"

# Comprehensive map of raw colors to design system tokens
replacements = [
    # Blue backgrounds
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
    
    # Blue text
    (r'\btext-blue-200\b', 'text-primary-200'),
    (r'\btext-blue-300\b', 'text-primary-300'),
    (r'\btext-blue-400\b', 'text-primary-400'),
    (r'\btext-blue-500\b', 'text-primary-500'),
    (r'\btext-blue-600\b', 'text-primary-600'),
    (r'\btext-blue-700\b', 'text-primary-700'),
    (r'\btext-blue-800\b', 'text-primary-800'),
    (r'\btext-blue-900\b', 'text-primary-900'),
    
    # Blue borders
    (r'\bborder-blue-100\b', 'border-primary-100'),
    (r'\bborder-blue-200\b', 'border-primary-200'),
    (r'\bborder-blue-500\b', 'border-primary-500'),
    (r'\bborder-blue-600\b', 'border-primary-600'),
    
    # Blue hover/focus
    (r'\bhover:bg-blue-700\b', 'hover:bg-primary-800'),
    (r'\bhover:bg-blue-600\b', 'hover:bg-primary-700'),
    (r'\bhover:text-blue-600\b', 'hover:text-primary-600'),
    (r'\bfocus:border-blue-600\b', 'focus:border-primary-500'),
    (r'\bfocus-visible:ring-blue-600\b', 'focus-visible:ring-primary-500'),
    (r'\bfocus:ring-blue-600\b', 'focus:ring-primary-500'),
    
    # Blue ring/shadow
    (r'\bring-blue-600\b', 'ring-primary-600'),
    (r'\bring-blue-500\b', 'ring-primary-500'),
    (r'\bshadow-blue-100\b', 'shadow-primary-100'),
    (r'\bshadow-blue-200\b', 'shadow-primary-200'),
    (r'\bshadow-blue-500/10\b', 'shadow-primary-500/10'),
    (r'\bshadow-blue-500/20\b', 'shadow-primary-500/20'),
    
    # Blue gradient stops
    (r'\bfrom-blue-50\b', 'from-primary-50'),
    (r'\bfrom-blue-500\b', 'from-primary-500'),
    (r'\bfrom-blue-600\b', 'from-primary-600'),
    (r'\bto-blue-600\b', 'to-primary-600'),
    (r'\bvia-blue-500\b', 'via-primary-500'),
    
    # Indigo -> primary
    (r'\bbg-indigo-50\b', 'bg-primary-50'),
    (r'\btext-indigo-600\b', 'text-primary-600'),
    (r'\bhover:text-indigo-600\b', 'hover:text-primary-600'),
    (r'\bfrom-indigo-50\b', 'from-primary-50'),
    (r'\bto-indigo-50\b', 'to-primary-50'),
    (r'\bto-indigo-600\b', 'to-primary-700'),
    (r'\bfrom-indigo-500\b', 'from-primary-500'),
    (r'\bvia-indigo-500\b', 'via-primary-500'),
    (r'\bborder-indigo-200\b', 'border-primary-200'),
    (r'\bshadow-indigo-100\b', 'shadow-primary-100'),
    
    # Orange -> accent
    (r'\bbg-orange-50\b', 'bg-accent-50'),
    (r'\bbg-orange-500\b', 'bg-accent-500'),
    (r'\bbg-orange-600\b', 'bg-accent-600'),
    (r'\btext-orange-500\b', 'text-accent-500'),
    (r'\btext-orange-600\b', 'text-accent-600'),
    (r'\bborder-orange-200\b', 'border-accent-200'),
    (r'\bhover:bg-orange-600\b', 'hover:bg-accent-600'),
    (r'\bfrom-orange-500\b', 'from-accent-500'),
    (r'\bto-orange-500\b', 'to-accent-500'),
    
    # Partial matches with /opacity
    (r'\bbg-blue-600/20\b', 'bg-primary-600/20'),
    (r'\bbg-blue-500/20\b', 'bg-primary-500/20'),
    (r'\bborder-blue-600/20\b', 'border-primary-600/20'),
    (r'\bborder-blue-500/30\b', 'border-primary-500/30'),
    (r'\bbg-orange-500/40\b', 'bg-accent-500/40'),
    (r'\bbg-blue-50/50\b', 'bg-primary-50/50'),
    (r'\bto-indigo-50/20\b', 'to-primary-50/20'),
    (r'\bbg-primary-500/20\b', 'bg-primary-500/20'),
    (r'\btext-blue-400\b', 'text-primary-400'),
    (r'\btext-blue-300\b', 'text-primary-300'),
]

count = 0
for root, _, files in os.walk(directory):
    for file in files:
        if not (file.endswith(".tsx") or file.endswith(".ts") or file.endswith(".css")):
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
            print(f"  Fixed: {file}")

print(f"\nDone. Updated {count} files.")
