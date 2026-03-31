import { Badge } from '@jaskier/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <Badge variant="accent" dot>
        Snapshot Badge
      </Badge>,
    );
    expect(container).toMatchSnapshot();
  });

  it('renders as a span element', () => {
    const { container } = render(<Badge>Tag</Badge>);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span?.textContent).toContain('Tag');
  });

  // -------------------------------------------------------------------------
  // Variants
  // -------------------------------------------------------------------------

  it('applies default variant classes', () => {
    const { container } = render(<Badge>Default</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-current');
  });

  it('applies accent variant classes', () => {
    const { container } = render(<Badge variant="accent">Accent</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-matrix-accent');
  });

  it('applies success variant classes', () => {
    const { container } = render(<Badge variant="success">Success</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-emerald-400');
  });

  it('applies warning variant classes', () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-amber-400');
  });

  it('applies error variant classes', () => {
    const { container } = render(<Badge variant="error">Error</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('matrix-error');
  });

  // -------------------------------------------------------------------------
  // Sizes
  // -------------------------------------------------------------------------

  it('applies md size classes by default', () => {
    const { container } = render(<Badge>Medium</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-xs');
    expect(span.className).toContain('px-2.5');
  });

  it('applies sm size classes', () => {
    const { container } = render(<Badge size="sm">Small</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('px-1.5');
  });

  it('applies lg size classes', () => {
    const { container } = render(<Badge size="lg">Large</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-sm');
  });

  // -------------------------------------------------------------------------
  // Dot indicator
  // -------------------------------------------------------------------------

  it('renders a dot indicator when dot prop is true', () => {
    const { container } = render(<Badge dot>With Dot</Badge>);
    // The dot is a small rounded span inside the badge
    const spans = container.querySelectorAll('span span');
    const dotEl = Array.from(spans).find((s) => s.className.includes('rounded-full'));
    expect(dotEl).toBeInTheDocument();
  });

  it('does not render a dot indicator by default', () => {
    const { container } = render(<Badge>No Dot</Badge>);
    const spans = container.querySelectorAll('span span');
    const dotEl = Array.from(spans).find((s) => s.className.includes('rounded-full'));
    expect(dotEl).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Icon
  // -------------------------------------------------------------------------

  it('renders icon when provided', () => {
    render(<Badge icon={<span data-testid="badge-icon">*</span>}>With Icon</Badge>);
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument();
  });

  it('renders both dot and icon when both are provided', () => {
    const { container } = render(
      <Badge dot icon={<span data-testid="badge-icon">*</span>}>
        Dot + Icon
      </Badge>,
    );
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument();
    const spans = container.querySelectorAll('span span');
    const dotEl = Array.from(spans).find((s) => s.className.includes('rounded-full'));
    expect(dotEl).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Custom className
  // -------------------------------------------------------------------------

  it('applies additional className', () => {
    const { container } = render(<Badge className="custom-class">Custom</Badge>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('custom-class');
  });
});
