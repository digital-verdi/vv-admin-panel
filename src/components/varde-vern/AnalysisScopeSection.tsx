import type * as t from '@/types';
import { Section, Badge } from './ui';

/**
 * Which text-bearing request fields each engine CLASS reads (ADR 0030).
 *
 * Operational status above answers "is the engine on, and in which phase". This answers "and what does
 * it actually look at" — the half that decides whether a risk assessment is right. An operator could
 * previously see Presidio in `enforce` without seeing that it never reads a system prompt, a tool
 * description or a `role: 'tool'` result.
 *
 * The data is derived server-side from the same table the segment extractor decides with
 * (services/vv-llm-proxy/src/segment/scope.ts), so this table cannot show a scope the pipeline does not
 * apply. Nothing here is editable: scope is a code change with an ADR, deliberately.
 */
export function AnalysisScopeSection({ scope }: { scope?: t.VardeVernAnalysisScope }) {
  // Older proxy: render nothing rather than an empty table. A blank matrix would read as "nothing is
  // analysed", which is the most dangerous thing this component could say.
  if (!scope || scope.fields.length === 0 || scope.engines.length === 0) {
    return null;
  }

  const authoritative = scope.engines.filter((e) => e.kind === 'authoritative');
  const supplementary = scope.engines.filter((e) => e.kind === 'supplementary');

  return (
    <Section
      title="Analysis scope"
      description="Which text-bearing fields each engine reads. The authoritative engines read every field, so structural identifiers — national ID, e-mail, IBAN, card, phone, tokens, private keys — are protected everywhere without exception. The semantic engine is limited to caller-authored content: a “not analysed” cell means only that it is skipped for names, places and organisations, never that the field is unprotected. Scope is fixed in code (ADR 0030), not configurable here."
    >
      <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
        <table className="w-full text-left text-sm">
          <thead className="text-(--cui-color-text-muted)">
            <tr>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Location</th>
              {scope.engines.map((engine) => (
                <th key={engine.id} className="px-3 py-2">
                  {engine.label}
                  <span className="block text-xs font-normal">{engine.kind}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scope.fields.map((field) => (
              <tr key={field.id} className="border-t border-(--cui-color-stroke-default)">
                <td className="px-3 py-2">{field.label}</td>
                <td className="px-3 py-2 font-mono text-xs break-all text-(--cui-color-text-muted)">
                  {field.jsonPath}
                </td>
                {authoritative.map((engine) => (
                  <td key={engine.id} className="px-3 py-2">
                    <Badge tone="protective">analysed</Badge>
                  </td>
                ))}
                {supplementary.map((engine) => (
                  <td key={engine.id} className="px-3 py-2">
                    {field.supplementary ? (
                      <Badge tone="measuring">analysed</Badge>
                    ) : (
                      <Badge tone="inactive">not analysed</Badge>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
