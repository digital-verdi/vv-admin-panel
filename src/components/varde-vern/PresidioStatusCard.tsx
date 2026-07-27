import { Icon } from '@clickhouse/click-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tone } from './operations';
import type * as t from '@/types';
import { refreshPresidioFn } from '@/server';
import { Chip, StatusRow } from './ui';
import { notifyError } from '@/utils';

const STATE_TONE: Record<string, Tone> = {
  ready: 'protective',
  degraded: 'measuring',
  unavailable: 'inactive',
  unknown: 'inactive',
};

export interface PresidioStatusCardProps {
  status?: t.PresidioStatus;
  /** MANAGE_CONFIGS — the refresh re-probe calls the privileged proxy admin API, so it is hidden without it
   *  (server-side is the real gate). Defaults to false (least privilege). */
  canManage?: boolean;
}

/**
 * Presidio Analyzer read-only deployment/health status (never the endpoint/host/token) + a re-probe button.
 * Relocated from the Presidio Analyzer tab to Overview → Operational status (ADR 0026 / Fase 5); the Test
 * Studio and everything else on the Presidio Analyzer tab stay where they are.
 */
export function PresidioStatusCard({ status, canManage = false }: PresidioStatusCardProps) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => refreshPresidioFn(),
    // The refresh re-probes on the proxy; invalidate the query so the card actually updates.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['varde-vern'] }),
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Presidio refresh failed'),
  });

  if (!status?.configured) {
    return (
      <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
        <div className="mb-2 flex items-center gap-2">
          <Chip tone="inactive">not configured</Chip>
          <span className="text-sm font-medium text-(--cui-color-title-default)">
            Presidio Analyzer Status
          </span>
        </div>
        <p className="text-sm text-(--cui-color-text-muted)">
          Presidio is not connected. Connect the analyzer before semantic detection can run.
        </p>
      </div>
    );
  }

  const live = status.state ?? 'unknown';

  return (
    <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Chip tone={STATE_TONE[live] ?? 'inactive'}>{live}</Chip>
          <span className="text-sm font-medium text-(--cui-color-title-default)">
            Presidio Analyzer Status
          </span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            title="Rechecks analyzer health and supported entity types."
            className="inline-flex items-center gap-1 rounded-md border border-(--cui-color-stroke-default) px-2 py-1 text-xs disabled:opacity-50"
          >
            <Icon name="refresh" size="sm" /> Refresh
          </button>
        )}
      </div>
      <StatusRow label="Credential" value={status.credential ?? 'managed'} />
      <StatusRow
        label="Image"
        value={`${status.imageMode ?? 'unknown'} · ${status.release ?? 'unknown'}`}
      />
      <StatusRow label="Digest" value={status.digest ?? 'unknown'} />
      <StatusRow
        label="Languages"
        value={(status.languages ?? [status.language]).filter(Boolean).join(', ') || '—'}
      />
      <StatusRow label="NLP Engine" value={status.nlpEngine ?? '—'} />
      <StatusRow label="Local PII engine" value={status.localEngine ?? '—'} />
      <StatusRow label="Inactive modules" value={(status.inactiveModules ?? []).join(', ') || '—'} />
      <StatusRow
        label="Supported entities"
        value={(status.supportedEntities ?? []).join(', ') || '—'}
      />
      <StatusRow
        label="Last probe"
        value={
          status.lastProbeAt
            ? `${new Date(status.lastProbeAt).toISOString()} (${status.lastProbeLatencyMs ?? '?'} ms)`
            : 'never'
        }
      />
    </div>
  );
}
