/**
 * Card Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../../../src/components/ui/Card';

describe('Card', () => {
  describe('rendering', () => {
    it('renders children', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('renders with default variant (default)', () => {
      render(<Card data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveClass('card');
    });
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Card variant="default" data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveClass('card');
    });

    it('renders glass variant', () => {
      render(<Card variant="glass" data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveClass('glass-panel');
    });

    it('renders solid variant', () => {
      render(<Card variant="solid" data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveClass('glass-panel-solid');
    });
  });

  describe('interactive', () => {
    it('applies interactive styles when interactive=true', () => {
      render(<Card interactive data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('card-interactive', 'cursor-pointer');
    });

    it('does not apply interactive styles by default', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).not.toHaveClass('card-interactive');
    });
  });

  describe('header and footer', () => {
    it('renders header when provided', () => {
      render(<Card header={<span>Header</span>}>Content</Card>);
      expect(screen.getByText('Header')).toBeInTheDocument();
    });

    it('renders footer when provided', () => {
      render(<Card footer={<span>Footer</span>}>Content</Card>);
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    it('renders both header and footer', () => {
      render(
        <Card header={<span>Header</span>} footer={<span>Footer</span>}>
          Content
        </Card>
      );
      expect(screen.getByText('Header')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    it('wraps header in bordered container', () => {
      render(<Card header={<span data-testid="header">Header</span>}>Content</Card>);
      const headerWrapper = screen.getByTestId('header').parentElement;
      expect(headerWrapper).toHaveClass('border-b');
    });

    it('wraps footer in bordered container', () => {
      render(<Card footer={<span data-testid="footer">Footer</span>}>Content</Card>);
      const footerWrapper = screen.getByTestId('footer').parentElement;
      expect(footerWrapper).toHaveClass('border-t');
    });
  });

  describe('props', () => {
    it('applies custom className', () => {
      render(<Card className="custom-class" data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });

    it('passes through HTML attributes', () => {
      render(<Card id="my-card" data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveAttribute('id', 'my-card');
    });
  });
});
