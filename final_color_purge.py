import os
import re

directory = r"C:\Users\ASUS\Downloads\volunteerny_final\src"

# Map raw colors to design system tokens
replacements = [
    # Blues -> primary
    (r'\btext-blue-600\b', 'text-primary-600'),
    (r'\btext-blue-700\b', 'text-primary-700'),
    (r'\btext-blue-500\b', 'text-primary-500'),
    (r'\bbg-blue-600\b', 'bg-primary-600'),
    (r'\bbg-blue-500\b', 'bg-primary-500'),
    (r'\bbg-blue-100\b', 'bg-primary-100'),
    (r'\bbg-blue-50\b', 'bg-primary-50'),
    (r'\bborder-blue-100\b', 'border-primary-100'),
    (r'\bborder-blue-200\b', 'border-primary-200'),
    (r'\bring-blue-600\b', 'ring-primary-600'),
    (r'\bring-blue-500\b', 'ring-primary-500'),
    (r'\bfocus:border-blue-600\b', 'focus:border-primary-500'),
    (r'\bfocus-visible:ring-blue-600\b', 'focus-visible:ring-primary-500'),
    (r'\bshadow-blue-200\b', 'shadow-primary-200'),
    (r'\btext-indigo-600\b', 'text-primary-600'),
    (r'\bhover:text-indigo-600\b', 'hover:text-primary-600'),
    
    # Orange -> accent (except in semantically appropriate contexts)
    (r'\bbg-\[#FF6B35\]\b', 'bg-accent-500'),
    (r'\bhover:bg-orange-600\b', 'hover:bg-accent-600'),
    (r'\btext-orange-500\b', 'text-accent-500'),
    (r'\btext-orange-600\b', 'text-accent-600'),
    (r'\bbg-orange-50\b', 'bg-accent-50'),
    (r'\bborder-orange-200\b', 'border-accent-200'),
    
    # Typography: tone down brutalism  
    (r'\bfont-black\b', 'font-bold'),
    (r'\bfont-extrabold\b', 'font-bold'),
    (r'\btracking-widest\b', 'tracking-wide'),
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
