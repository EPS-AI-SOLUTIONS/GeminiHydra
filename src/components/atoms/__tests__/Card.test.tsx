import { Card, CardBody, CardFooter, CardHeader } from '@jaskier/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card Content</Card>);
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('matches snapshot with composition API', () => {
    const { container } = render(
      <Card variant="glass" padding="md">
        <CardHeader>
          <h3>Title</h3>
        </CardHeader>
        <CardBody>Body</CardBody>
        <CardFooter>
          <button type="button">Save</button>
        </CardFooter>
      </Card>,
    );
    expect(container).toMatchSnapshot();
  });
});
