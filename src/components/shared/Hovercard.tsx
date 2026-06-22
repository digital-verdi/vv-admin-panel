import * as Ariakit from '@ariakit/react';
import type * as t from '@/types';
import { cn } from '@/utils';

/**
 * Accessible, click-ui-styled hovercard built on `@ariakit/react`.
 *
 * The trigger is an always-visible `HovercardAnchor` button: pointer users open
 * it by hovering, and keyboard users open it by focusing the button and pressing
 * Enter/Space (which toggles the store). `HovercardDisclosure` is intentionally
 * not used as the trigger — it renders visually hidden until the anchor receives
 * keyboard focus, which would make an icon-only trigger invisible to mouse users.
 */
export function Hovercard({
  trigger,
  children,
  label,
  heading,
  placement = 'bottom',
  gutter = 8,
  triggerClassName,
  className,
}: t.HovercardProps) {
  const store = Ariakit.useHovercardStore({ placement, showTimeout: 150, hideTimeout: 200 });
  const open = Ariakit.useStoreState(store, 'open');

  return (
    <>
      <Ariakit.HovercardAnchor
        store={store}
        aria-label={label}
        aria-expanded={open}
        onClick={() => store.toggle()}
        render={
          <button
            type="button"
            className={cn(
              'inline-flex shrink-0 cursor-help items-center justify-center rounded-full text-(--cui-color-text-muted) transition-colors hover:text-(--cui-color-text-default) focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--cui-color-outline)',
              triggerClassName,
            )}
          />
        }
      >
        {trigger}
      </Ariakit.HovercardAnchor>
      <Ariakit.Hovercard
        store={store}
        portal
        gutter={gutter}
        unmountOnHide
        className={cn(
          'z-(--z-command) flex w-72 max-w-[90vw] flex-col gap-1.5 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) p-3 text-sm leading-relaxed text-(--cui-color-text-muted) shadow-lg focus-visible:outline-none',
          className,
        )}
      >
        {heading && (
          <Ariakit.HovercardHeading className="text-sm font-semibold text-(--cui-color-text-default)">
            {heading}
          </Ariakit.HovercardHeading>
        )}
        {children}
      </Ariakit.Hovercard>
    </>
  );
}
