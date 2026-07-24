import os
import re

directory = r"C:\Users\ASUS\Downloads\volunteerny_final\src"

# These are STRUCTURAL pattern replacements that actually change the look
replacements = [
    # Tab styling: old brutalist uppercase tabs → modern minimal tabs
    (r'font-bold text-xs uppercase tracking-wide', 'text-sm font-medium tracking-normal'),
    
    # Remaining brutalist patterns
    (r'uppercase tracking-wide', 'tracking-normal'),
    (r'text-\[9\.5px\] font-bold uppercase tracking-wide', 'text-xs font-medium'),
    (r'text-\[10px\] font-bold uppercase tracking-wide', 'text-xs font-medium'),
    (r'text-\[10\.5px\] font-bold uppercase', 'text-xs font-medium'),
    (r'text-\[10px\] font-bold uppercase', 'text-xs font-medium'),
    (r'text-\[8px\] font-bold uppercase', 'text-[10px] font-medium'),
    (r'text-\[7px\] font-bold uppercase tracking-wide', 'text-[10px] font-medium'),
    (r'text-\[9px\] font-bold uppercase', 'text-xs font-medium'),
    (r'text-xs font-bold uppercase tracking-wider', 'text-xs font-medium'),
    (r'text-xs font-bold uppercase tracking-wide', 'text-xs font-medium'),
    (r'text-xs font-bold uppercase', 'text-xs font-medium'),
    
    # Over-round corners
    (r'rounded-\[2\.5rem\]', 'rounded-xl'),
    (r'rounded-\[2rem\]', 'rounded-xl'),
    (r'rounded-\[3rem\]', 'rounded-xl'),
    (r'rounded-\[1\.5rem\]', 'rounded-lg'),
    
    # Heavy shadows → design system
    (r'shadow-card shadow-primary-200', 'shadow-card'),
    
    # animate-pulse on non-loading elements (remove from icons)
    (r'animate-pulse" />', '" />'),
    
    # Clean up gradient backgrounds on cards (keep simple)
    (r'bg-gradient-to-r from-primary-50/50 to-primary-50/20', 'bg-primary-50/40'),
    (r'bg-gradient-to-br from-primary-50 via-white to-white', 'bg-white'),
    (r'bg-gradient-to-br from-primary-600 to-primary-700', 'bg-primary-700'),
    (r'bg-gradient-to-r from-primary-600 to-primary-700', 'bg-primary-700'),
    (r'bg-gradient-to-r from-primary-600 via-primary-500 to-accent-500', 'bg-primary-700'),
    
    # Fix hover scale jank → subtle translate
    (r'hover:scale-\[1\.03\]', 'hover:-translate-y-px'),
    (r'hover:scale-\[1\.02\]', 'hover:-translate-y-px'),
    (r'hover:scale-105', 'hover:-translate-y-px'),
    
    # Remove remaining emerald (not in token system)
    (r'\bbg-emerald-50\b', 'bg-success-50'),
    (r'\btext-emerald-600\b', 'text-success-600'),
    (r'\btext-emerald-700\b', 'text-success-700'),
    (r'\bborder-emerald-200\b', 'border-success-200'),
    (r'\bbg-emerald-500\b', 'bg-success-500'),
    (r'\bbg-emerald-600\b', 'bg-success-600'),
    (r'\btext-emerald-500\b', 'text-success-500'),
    (r'\bbg-emerald-400\b', 'bg-success-400'),
    (r'\bfrom-emerald-\d+\b', 'from-success-500'),
    (r'\bto-emerald-\d+\b', 'to-success-600'),
    
    # Remove remaining amber
    (r'\bbg-amber-50\b', 'bg-warning-50'),
    (r'\btext-amber-600\b', 'text-warning-600'),
    (r'\btext-amber-700\b', 'text-warning-700'),
    (r'\bborder-amber-200\b', 'border-warning-200'),
    (r'\bbg-amber-500\b', 'bg-warning-500'),
    (r'\btext-amber-500\b', 'text-warning-500'),
    (r'\bbg-amber-400\b', 'bg-accent-400'),
    
    # Remove remaining purple/violet/pink
    (r'\bbg-purple-50\b', 'bg-primary-50'),
    (r'\btext-purple-600\b', 'text-primary-600'),
    (r'\btext-purple-700\b', 'text-primary-700'),
    (r'\bborder-purple-200\b', 'border-primary-200'),
    (r'\bbg-purple-500\b', 'bg-primary-500'),
    (r'\bbg-violet-50\b', 'bg-primary-50'),
    (r'\btext-violet-600\b', 'text-primary-600'),
    (r'\bborder-violet-200\b', 'border-primary-200'),
    (r'\bbg-pink-50\b', 'bg-accent-50'),
    (r'\btext-pink-600\b', 'text-accent-600'),
    (r'\bborder-pink-200\b', 'border-accent-200'),
    
    # Remove remaining teal/cyan
    (r'\bbg-teal-50\b', 'bg-primary-50'),
    (r'\btext-teal-600\b', 'text-primary-600'),
    (r'\bborder-teal-200\b', 'border-primary-200'),
    (r'\bbg-cyan-50\b', 'bg-primary-50'),
    (r'\btext-cyan-600\b', 'text-primary-600'),
    
    # Remove remaining sky
    (r'\bbg-sky-50\b', 'bg-primary-50'),
    (r'\btext-sky-600\b', 'text-primary-600'),
    (r'\bborder-sky-200\b', 'border-primary-200'),
    
    # Remove remaining rose
    (r'\bbg-rose-50\b', 'bg-danger-50'),
    (r'\btext-rose-600\b', 'text-danger-600'),
    (r'\bborder-rose-200\b', 'border-danger-200'),
    
    # Remove remaining lime/green
    (r'\bbg-lime-50\b', 'bg-success-50'),
    (r'\btext-lime-600\b', 'text-success-600'),
    (r'\bborder-lime-200\b', 'border-success-200'),
    (r'\bbg-green-50\b', 'bg-success-50'),
    (r'\btext-green-600\b', 'text-success-600'),
    (r'\btext-green-700\b', 'text-success-700'),
    (r'\bborder-green-200\b', 'border-success-200'),
    (r'\bbg-green-500\b', 'bg-success-500'),
    (r'\bbg-green-600\b', 'bg-success-600'),
    (r'\btext-green-500\b', 'text-success-500'),
    (r'\btext-green-400\b', 'text-success-400'),
    
    # Remove remaining red (use danger-)
    (r'\bbg-red-50\b', 'bg-danger-50'),
    (r'\btext-red-600\b', 'text-danger-600'),
    (r'\btext-red-700\b', 'text-danger-700'),
    (r'\bborder-red-100\b', 'border-danger-100'),
    (r'\bborder-red-200\b', 'border-danger-200'),
    (r'\bbg-red-500\b', 'bg-danger-500'),
    (r'\bbg-red-600\b', 'bg-danger-600'),
    (r'\btext-red-500\b', 'text-danger-500'),
    (r'\btext-red-400\b', 'text-danger-400'),
    (r'\bhover:bg-red-600\b', 'hover:bg-danger-600'),
    (r'\bhover:bg-red-700\b', 'hover:bg-danger-700'),
    
    # Remove remaining yellow
    (r'\bbg-yellow-50\b', 'bg-warning-50'),
    (r'\btext-yellow-600\b', 'text-warning-600'),
    (r'\btext-yellow-700\b', 'text-warning-700'),
    (r'\bborder-yellow-200\b', 'border-warning-200'),
    (r'\bbg-yellow-500\b', 'bg-warning-500'),
    (r'\bbg-yellow-400\b', 'bg-warning-400'),
    (r'\btext-yellow-500\b', 'text-warning-500'),
    (r'\btext-yellow-400\b', 'text-warning-400'),
]

count = 0
for root, _, files in os.walk(directory):
    for file in files:
        if not (file.endswith(".tsx") or file.endswith(".ts")):
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
