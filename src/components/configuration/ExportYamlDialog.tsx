import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Dialog } from '@clickhouse/click-ui';
import type * as t from '@/types';
import {
  serializeConfigToYaml,
  normalizeYamlFilename,
  downloadYamlFile,
  scopeSourceLabel,
} from './export';
import { parseImportedYaml } from '@/server';
import { notifySuccess } from '@/utils';
import { useLocalize } from '@/hooks';

export function ExportYamlDialog({ open, snapshot, onClose }: t.ExportYamlDialogProps) {
  const localize = useLocalize();
  const inputRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [validationErrors, setValidationErrors] = useState<t.ImportValidationError[]>();

  useEffect(() => {
    if (open && snapshot) {
      setFilename(snapshot.suggestedFilename);
      setLoading(false);
      setError(undefined);
      setValidationErrors(undefined);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, snapshot]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const finalFilename = snapshot ? normalizeYamlFilename(filename, snapshot.suggestedFilename) : '';

  const handleExport = useCallback(async () => {
    if (!snapshot || loading) {
      return;
    }
    setLoading(true);
    setError(undefined);
    setValidationErrors(undefined);

    try {
      const yamlText = serializeConfigToYaml(snapshot.config);
      const result = await parseImportedYaml({ data: { yamlContent: yamlText } });

      if (!result.success) {
        setError(result.error ?? localize('com_config_export_yaml_error'));
        if (result.validationErrors) {
          setValidationErrors(result.validationErrors as t.ImportValidationError[]);
        }
        return;
      }

      downloadYamlFile(yamlText, normalizeYamlFilename(filename, snapshot.suggestedFilename));
      notifySuccess(localize('com_config_export_yaml_success'));
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : localize('com_config_export_yaml_error'));
    } finally {
      setLoading(false);
    }
  }, [snapshot, loading, filename, localize, handleClose]);

  if (!snapshot) {
    return null;
  }

  const sourceName = scopeSourceLabel(snapshot.scopeSelection, localize);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <Dialog.Content
        title={localize('com_config_export_yaml_title')}
        showClose
        onClose={handleClose}
        className="modal-frost"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-(--cui-color-text-muted)">
            {localize('com_config_export_yaml_desc')}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-(--cui-color-text-muted)">
              {localize('com_config_export_yaml_source')}:
            </span>
            <span className="font-medium text-(--cui-color-text-default)">{sourceName}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="export-yaml-filename"
              className="text-xs font-medium text-(--cui-color-text-muted)"
            >
              {localize('com_config_export_yaml_filename')}
            </label>
            <input
              ref={inputRef}
              id="export-yaml-filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  e.preventDefault();
                  void handleExport();
                }
              }}
              aria-describedby="export-yaml-final-filename"
              className="config-input w-full"
              spellCheck={false}
            />
            <span id="export-yaml-final-filename" className="text-xs text-(--cui-color-text-muted)">
              {localize('com_config_export_yaml_final_filename', { name: finalFilename })}
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-lg bg-[rgba(234,179,8,0.1)] px-3 py-2">
            <span className="text-xs text-(--cui-color-text-default)">
              {localize('com_config_export_yaml_warning')}
            </span>
            <span className="text-xs text-(--cui-color-text-muted)">
              {localize('com_config_export_yaml_import_effect')}
            </span>
          </div>

          {error && (
            <div
              className="flex flex-col gap-1 rounded-lg bg-[rgba(220,38,38,0.1)] px-3 py-2"
              role="alert"
            >
              <span className="text-sm font-medium text-(--cui-color-text-danger)">{error}</span>
              {validationErrors && validationErrors.length > 0 && (
                <ul className="m-0 max-h-32 list-none overflow-auto p-0 text-xs text-(--cui-color-text-danger)">
                  {validationErrors.slice(0, 10).map((ve, i) => (
                    <li key={`${ve.path}-${i}`} className="py-0.5">
                      <code>{ve.path}</code>: {ve.message}
                    </li>
                  ))}
                  {validationErrors.length > 10 && (
                    <li className="py-0.5 opacity-70">
                      {localize('com_config_validation_more', {
                        count: String(validationErrors.length - 10),
                      })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="sr-only" aria-live="polite">
            {loading && localize('com_config_export_yaml_preparing')}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="secondary" label={localize('com_ui_cancel')} onClick={handleClose} />
            <Button
              type="primary"
              label={
                loading
                  ? localize('com_config_export_yaml_preparing')
                  : localize('com_config_export_yaml_action')
              }
              iconLeft={loading ? 'loading-animated' : undefined}
              onClick={() => void handleExport()}
              disabled={loading}
            />
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
