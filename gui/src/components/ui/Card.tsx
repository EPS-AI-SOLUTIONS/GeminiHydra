/**
 * Card Component - Matrix Glass Theme
 */

import { type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'solid';
  interactive?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

export function Card({
  className,
  variant = 'default',
  interactive = false,
  header,
  footer,
  children,
  ...props
}: CardProps) {
  const variantClasses = {
    default: 'card',
    glass: 'glass-panel',
    solid: 'glass-panel-solid',
  };

  return (
    <div
      className={clsx(
        variantClasses[variant],
        interactive && 'card-interactive cursor-pointer transition-transform hover:-translate-y-0.5 hover:scale-[1.01]',
        className
      )}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-[var(--matrix-border)]">
          {header}
        </div>
      )}
      <div className={header || footer ? 'p-4' : ''}>{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-[var(--matrix-border)]">
          {footer}
        </div>
      )}
    </div>
  );
}
