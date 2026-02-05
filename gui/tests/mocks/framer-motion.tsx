/**
 * Framer Motion Mock - Simplified for testing
 */

import React, { forwardRef, type ReactNode, type ComponentProps } from 'react';

type MotionProps<T extends keyof JSX.IntrinsicElements> = ComponentProps<T> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  whileHover?: unknown;
  whileTap?: unknown;
  transition?: unknown;
};

export const motion = {
  div: forwardRef<HTMLDivElement, MotionProps<'div'>>(
    ({ children, initial, animate, exit, whileHover, whileTap, transition, ...props }, ref) => (
      <div ref={ref} {...props}>{children}</div>
    )
  ),
  aside: forwardRef<HTMLElement, MotionProps<'aside'>>(
    ({ children, initial, animate, exit, whileHover, whileTap, transition, ...props }, ref) => (
      <aside ref={ref} {...props}>{children}</aside>
    )
  ),
  span: forwardRef<HTMLSpanElement, MotionProps<'span'>>(
    ({ children, initial, animate, exit, whileHover, whileTap, transition, ...props }, ref) => (
      <span ref={ref} {...props}>{children}</span>
    )
  ),
  button: forwardRef<HTMLButtonElement, MotionProps<'button'>>(
    ({ children, initial, animate, exit, whileHover, whileTap, transition, ...props }, ref) => (
      <button ref={ref} {...props}>{children}</button>
    )
  ),
};

export const AnimatePresence = ({ children, mode }: { children: ReactNode; mode?: string }) => (
  <>{children}</>
);

export default motion;
