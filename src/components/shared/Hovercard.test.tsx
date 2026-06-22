import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Hovercard } from './Hovercard';

describe('Hovercard', () => {
  it('renders a focusable trigger button with the given accessible name', () => {
    render(
      <Hovercard label="More info" trigger={<span>icon</span>}>
        Body text
      </Hovercard>,
    );
    const trigger = screen.getByRole('button', { name: 'More info' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the trigger visible (not the visually-hidden HovercardDisclosure)', () => {
    render(
      <Hovercard label="More info" trigger={<span>icon</span>}>
        Body text
      </Hovercard>,
    );
    const trigger = screen.getByRole('button', { name: 'More info' });
    // HovercardDisclosure clips its element with these inline styles until the
    // anchor gets keyboard focus; the trigger must never carry them.
    const style = trigger.getAttribute('style') ?? '';
    expect(style).not.toContain('clip');
    expect(style).not.toContain('position: absolute');
    expect(trigger).toBeVisible();
  });

  it('does not render card content until opened', () => {
    render(
      <Hovercard label="More info" trigger={<span>icon</span>}>
        Body text
      </Hovercard>,
    );
    expect(screen.queryByText('Body text')).not.toBeInTheDocument();
  });

  it('reveals the heading and content when the trigger is activated', async () => {
    render(
      <Hovercard label="More info" heading="Reset to default" trigger={<span>icon</span>}>
        Body text
      </Hovercard>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More info' }));
    expect(await screen.findByText('Body text')).toBeInTheDocument();
    expect(screen.getByText('Reset to default')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More info' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
