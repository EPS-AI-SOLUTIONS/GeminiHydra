/**
 * Badge Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../../src/components/ui/Badge';
import { Check } from 'lucide-react';

describe('Badge', () => {
  describe('rendering', () => {
    it('renders children', () => {
      render(<Badge>Status</Badge>);
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('renders with default variant', () => {
      render(<Badge data-testid="badge">Default</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge-default');
    });
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Badge variant="default" data-testid="badge">Default</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge-default');
    });

    it('renders accent variant', () => {
      render(<Badge variant="accent" data-testid="badge">Accent</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge-accent');
    });

    it('renders success variant', () => {
      render(<Badge variant="success" data-testid="badge">Success</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge-success');
    });

    it('renders warning variant', () => {
      render(<Badge variant="warning" data-testid="badge">Warning</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge-warning');
    });

    it('renders error variant', () => {
      render(<Badge variant="error" data-testid="badge">Error</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge-error');
    });
  });

  describe('icon', () => {
    it('renders icon when provided', () => {
      render(<Badge icon={<Check data-testid="icon" />}>With Icon</Badge>);
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('renders icon before children', () => {
      render(
        <Badge icon={<Check data-testid="icon" />} data-testid="badge">
          Text
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      const icon = screen.getByTestId('icon');
      expect(badge.firstChild).toBe(icon);
    });
  });

  describe('props', () => {
    it('applies custom className', () => {
      render(<Badge className="custom-class" data-testid="badge">Custom</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('custom-class');
    });

    it('passes through HTML attributes', () => {
      render(<Badge id="my-badge" data-testid="badge">Badge</Badge>);
      expect(screen.getByTestId('badge')).toHaveAttribute('id', 'my-badge');
    });

    it('applies base badge class', () => {
      render(<Badge data-testid="badge">Base</Badge>);
      expect(screen.getByTestId('badge')).toHaveClass('badge');
    });
  });
});
