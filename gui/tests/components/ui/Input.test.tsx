/**
 * Input Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { Input } from '../../../src/components/ui/Input';
import { Search, X } from 'lucide-react';

describe('Input', () => {
  describe('rendering', () => {
    it('renders input element', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders with placeholder', () => {
      render(<Input placeholder="Enter text..." />);
      expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument();
    });
  });

  describe('label', () => {
    it('renders label when provided', () => {
      render(<Input label="Username" />);
      expect(screen.getByText('Username')).toBeInTheDocument();
    });

    it('associates label with input via htmlFor', () => {
      render(<Input label="Email" id="email-input" />);
      const label = screen.getByText('Email');
      expect(label).toHaveAttribute('for', 'email-input');
    });

    it('generates random id when not provided', () => {
      render(<Input label="Random" />);
      const input = screen.getByRole('textbox');
      expect(input.id).toMatch(/^input-/);
    });
  });

  describe('error', () => {
    it('renders error message when provided', () => {
      render(<Input error="This field is required" />);
      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('applies error styles to input', () => {
      render(<Input error="Error" />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('border-[var(--matrix-error)]');
    });
  });

  describe('icons', () => {
    it('renders leftIcon', () => {
      render(<Input leftIcon={<Search data-testid="left-icon" />} />);
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    });

    it('renders rightIcon', () => {
      render(<Input rightIcon={<X data-testid="right-icon" />} />);
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('applies padding for leftIcon', () => {
      render(<Input leftIcon={<Search />} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('pl-10');
    });

    it('applies padding for rightIcon', () => {
      render(<Input rightIcon={<X />} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('pr-10');
    });
  });

  describe('interactions', () => {
    it('handles onChange events', () => {
      const onChange = vi.fn();
      render(<Input onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'test' } });

      expect(onChange).toHaveBeenCalled();
    });

    it('handles onFocus events', () => {
      const onFocus = vi.fn();
      render(<Input onFocus={onFocus} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      expect(onFocus).toHaveBeenCalled();
    });

    it('handles onBlur events', () => {
      const onBlur = vi.fn();
      render(<Input onBlur={onBlur} />);

      const input = screen.getByRole('textbox');
      fireEvent.blur(input);

      expect(onBlur).toHaveBeenCalled();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to input element', () => {
      const ref = createRef<HTMLInputElement>();
      render(<Input ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('allows focus via ref', () => {
      const ref = createRef<HTMLInputElement>();
      render(<Input ref={ref} />);

      ref.current?.focus();
      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe('props', () => {
    it('applies custom className', () => {
      render(<Input className="custom-class" />);
      expect(screen.getByRole('textbox')).toHaveClass('custom-class');
    });

    it('passes through HTML attributes', () => {
      render(<Input type="email" name="email" required />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
      expect(input).toHaveAttribute('name', 'email');
      expect(input).toBeRequired();
    });

    it('supports disabled state', () => {
      render(<Input disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('supports readOnly state', () => {
      render(<Input readOnly value="readonly" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    });
  });
});
