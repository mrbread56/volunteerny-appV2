import React from 'react';
import { cn } from '../../lib/utils';

// `id` is accepted so a Card can be the target of aria-controls or a skip
// link. It was previously impossible to reference one from another element.
export function Card({ children, className, onClick, style, id }: { children: React.ReactNode; className?: string, onClick?: () => void, key?: React.Key, style?: React.CSSProperties, id?: string }) {
  return (
    <div
      id={id}
      className={cn(
        // --shadow-subtle, not a hardcoded near-duplicate of it. This was
        // rgba(15,30,41,0.04) against the token's rgba(26,43,54,0.05): a
        // different tint and a different alpha for the same visual role, so
        // the base card and everything using the token disagreed slightly.
        'bg-white border border-line rounded-lg shadow-subtle overflow-hidden transition-all duration-200',
        onClick && 'cursor-pointer hover:border-ink/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-dark',
        className
      )}
      onClick={onClick}
      style={style}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-6 sm:p-8 border-b border-line', className)}>{children}</div>;
}

/**
 * `as` exists because CardTitle was hardcoded to <h3>. Pages whose main title
 * is a CardTitle therefore had no <h1> and started their heading outline three
 * levels deep. Pass `as="h1"` (or h2) where the card *is* the page.
 */
export function CardTitle({ children, className, as: Tag = 'h3' }: {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}) {
  return <Tag className={cn('text-xl font-semibold tracking-[-0.02em] text-ink', className)}>{children}</Tag>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-6 sm:p-8', className)}>{children}</div>;
}

