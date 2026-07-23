import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import {
  groupEntitiesByEngine,
  entityDisplayName,
  phaseTone,
  actionTone,
  presidioScorePolicyIntro,
  effectiveDisposition,
  dispositionDisplay,
} from './operations';

const entity = (over: Partial<t.VardeVernEntity>): t.VardeVernEntity => ({
  entityType: 'X',
  label: 'X',
  engine: 'regex',
  confidenceApplicable: false,
  action: 'enforce',
  ...over,
});

describe('groupEntitiesByEngine', () => {
  it('splits by backend engine group, preserving order within each group', () => {
    const entities = [
      entity({ entityType: 'FNR', engine: 'regex' }),
      entity({ entityType: 'PERSON', engine: 'semantic' }),
      entity({ entityType: 'EMAIL', engine: 'regex' }),
      entity({ entityType: 'LOCATION', engine: 'semantic' }),
    ];
    const split = groupEntitiesByEngine(entities);
    expect(split.regex.map((e) => e.entityType)).toEqual(['FNR', 'EMAIL']);
    expect(split.semantic.map((e) => e.entityType)).toEqual(['PERSON', 'LOCATION']);
  });

  it('handles an empty list', () => {
    const split = groupEntitiesByEngine([]);
    expect(split.regex).toEqual([]);
    expect(split.semantic).toEqual([]);
  });
});

describe('entityDisplayName', () => {
  it('maps the integrated codes to title-case display names', () => {
    expect(entityDisplayName('PERSON')).toBe('Person');
    expect(entityDisplayName('LOCATION')).toBe('Location');
    expect(entityDisplayName('ORG')).toBe('Organization');
    expect(entityDisplayName('ORGANIZATION')).toBe('Organization');
  });

  it('title-cases unknown codes as a fallback', () => {
    expect(entityDisplayName('DATE_TIME')).toBe('Date Time');
    expect(entityDisplayName('NRP')).toBe('Nrp');
  });
});

describe('presidioScorePolicyIntro', () => {
  it('names the live fixed spaCy score when the backend exposes it', () => {
    const intro = presidioScorePolicyIntro(0.85);
    expect(intro).toContain('0.85');
    expect(intro).toMatch(/technical score/i);
    expect(intro).not.toMatch(/defaults to/i);
  });

  it('names BOTH the empty-state default and the fixed score when both are exposed', () => {
    const intro = presidioScorePolicyIntro(0.85, 0.5);
    expect(intro).toContain('0.85');
    expect(intro).toMatch(/Empty defaults to 0\.5/);
  });

  it('omits any number when neither score is available', () => {
    const intro = presidioScorePolicyIntro(undefined);
    expect(intro).not.toMatch(/[0-9]/);
    expect(intro).not.toContain('0.85');
  });
});

describe('tones', () => {
  it('phaseTone maps enforce→protective, shadow→measuring, off→inactive', () => {
    expect(phaseTone('enforce')).toBe('protective');
    expect(phaseTone('shadow')).toBe('measuring');
    expect(phaseTone('off')).toBe('inactive');
  });

  it('actionTone maps block/enforce→protective, shadow→measuring, allow→inactive', () => {
    expect(actionTone('block')).toBe('protective');
    expect(actionTone('enforce')).toBe('protective');
    expect(actionTone('shadow')).toBe('measuring');
    expect(actionTone('allow')).toBe('inactive');
  });
});

// The full disposition truth table, pinned to the proxy's authoritative disposition(action, phase)
// (vv-llm-proxy pii/vern-pipeline.ts). If the proxy logic changes, this must change in lockstep.
describe('effectiveDisposition (mirror of proxy disposition())', () => {
  it('off/disabled phase ignores every action (the global ceiling wins)', () => {
    for (const phase of ['off', 'disabled'] as const) {
      for (const action of ['allow', 'shadow', 'enforce', 'block'] as const) {
        expect(effectiveDisposition(action, phase)).toBe('ignore');
      }
    }
  });

  it('shadow phase is a ceiling: allow→ignore, everything else observes (enforce/block downgraded)', () => {
    expect(effectiveDisposition('allow', 'shadow')).toBe('ignore');
    expect(effectiveDisposition('shadow', 'shadow')).toBe('shadow');
    expect(effectiveDisposition('enforce', 'shadow')).toBe('shadow');
    expect(effectiveDisposition('block', 'shadow')).toBe('shadow');
  });

  it('enforce phase applies each action fully', () => {
    expect(effectiveDisposition('allow', 'enforce')).toBe('ignore');
    expect(effectiveDisposition('shadow', 'enforce')).toBe('shadow');
    expect(effectiveDisposition('enforce', 'enforce')).toBe('enforce');
    expect(effectiveDisposition('block', 'enforce')).toBe('block');
  });
});

describe('dispositionDisplay', () => {
  it('maps each disposition to its outcome label + tone', () => {
    expect(dispositionDisplay('ignore')).toEqual({ label: 'Ignored', tone: 'inactive' });
    expect(dispositionDisplay('shadow')).toEqual({ label: 'Observe', tone: 'measuring' });
    expect(dispositionDisplay('enforce')).toEqual({ label: 'Mask', tone: 'protective' });
    expect(dispositionDisplay('block')).toEqual({ label: 'Reject', tone: 'protective' });
  });
});
