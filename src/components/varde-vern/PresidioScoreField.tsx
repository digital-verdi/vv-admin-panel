import { PRESIDIO_SCORE_TEST_LABEL, PRESIDIO_SCORE_TEST_INTRO } from './operations';
import { NumberField } from '@/components/configuration/fields';

export interface PresidioScoreFieldProps {
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * The transient "Test score filter" for the native test studio. It scopes THIS test run only — a
 * COARSE cutoff on a raw Presidio score, a technical value rather than a calibrated probability — and is
 * evaluated separately from the saved per-entity policy thresholds.
 */
export function PresidioScoreField({
  id,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: PresidioScoreFieldProps) {
  return (
    <div className="flex max-w-md flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-(--cui-color-text-default)">
        {PRESIDIO_SCORE_TEST_LABEL}
      </label>
      <NumberField
        id={id}
        value={value}
        onChange={onChange}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled}
        aria-label={ariaLabel ?? PRESIDIO_SCORE_TEST_LABEL}
      />
      <p className="text-xs text-(--cui-color-text-muted)">{PRESIDIO_SCORE_TEST_INTRO}</p>
    </div>
  );
}
