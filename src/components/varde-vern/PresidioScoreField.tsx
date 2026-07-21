import { PRESIDIO_SCORE_LABEL, PRESIDIO_SCORE_HELP, PRESIDIO_SCORE_FIXED_NOTE } from './operations';
import { NumberField } from '@/components/configuration/fields';

export interface PresidioScoreFieldProps {
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  /** Show the fixed-0.85 note — true for today's spaCy-based semantic entities + the test studio. */
  showFixedNote?: boolean;
  'aria-label'?: string;
}

/**
 * The "Minimum Presidio-score" control shared by the per-entity semantic settings and the native test
 * studio. The value is a COARSE cutoff on a raw Presidio score — the help text is explicit that it is a
 * technical value, not a calibrated probability, and (for the fixed spaCy recognizer) that today's fixed
 * 0.85 makes the threshold binary rather than a fine-tuning slider.
 */
export function PresidioScoreField({
  id,
  value,
  onChange,
  disabled,
  showFixedNote = false,
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
      <p className="text-xs text-(--cui-color-text-muted)">{PRESIDIO_SCORE_HELP}</p>
      {showFixedNote && (
        <p className="text-xs text-(--cui-color-text-muted)">{PRESIDIO_SCORE_FIXED_NOTE}</p>
      )}
    </div>
  );
}
