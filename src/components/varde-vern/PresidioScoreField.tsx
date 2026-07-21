import { PRESIDIO_SCORE_LABEL, PRESIDIO_SCORE_INTRO } from './operations';
import { NumberField } from '@/components/configuration/fields';

export interface PresidioScoreFieldProps {
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * The "Minimum score" control for the native test studio. The value is a COARSE cutoff on a raw
 * Presidio score — the single consolidated intro line makes explicit that it is a technical value,
 * not a calibrated probability, and that today's fixed spaCy 0.85 makes the threshold binary.
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
        {PRESIDIO_SCORE_LABEL}
      </label>
      <NumberField
        id={id}
        value={value}
        onChange={onChange}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled}
        aria-label={ariaLabel ?? PRESIDIO_SCORE_LABEL}
      />
      <p className="text-xs text-(--cui-color-text-muted)">{PRESIDIO_SCORE_INTRO}</p>
    </div>
  );
}
