import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ children, className, onClick, style }: { children: React.ReactNode; className?: string, onClick?: () => void, key?: React.Key, style?: React.CSSProperties }) {
  return (
    <div 
      className={cn(
        'bg-white border border-line overflow-hidden transition-all duration-200',
        onClick && 'cursor-pointer hover:border-ink/20 active:scale-[0.99]',
        className
      )}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-6 sm:p-8 border-b border-line', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-xl font-semibold tracking-[-0.02em] text-ink', className)}>{children}</h3>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-6 sm:p-8', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-6 sm:p-8 bg-white border-t border-line flex items-center', className)}>{children}</div>;
}
