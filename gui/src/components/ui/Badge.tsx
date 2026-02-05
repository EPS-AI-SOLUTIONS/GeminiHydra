/**
 * Badge Component - Matrix Glass Theme
 */

import { type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'badge-default',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
};

export function Badge({
  className,
  variant = 'default',
  icon,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={clsx('badge', variantClasses[variant], className)} {...props}>
      {icon}
      {children}
    </span>
  );
}
