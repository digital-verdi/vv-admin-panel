export {
  SystemCapabilities,
  expandImplications,
  hasImpliedCapability,
  CAPABILITY_CATEGORIES,
  CapabilityImplications,
} from '@librechat/data-schemas/capabilities';

/**
 * Forward-compat shim: the LibreChat backend gates `/api/admin/audit-log` on
 * this capability string, and the LC sibling PR adds it to
 * `SystemCapabilities` in `@librechat/data-schemas@0.0.53`. Until that version
 * is published to npm and the pin here is bumped, referencing
 * `SystemCapabilities.READ_AUDIT_LOG` directly breaks `tsc` against the
 * currently-pinned `^0.0.52`. The value is byte-identical to what the upstream
 * constant will resolve to post-publish; drop this constant in a one-line
 * follow-up once the data-schemas pin moves to `^0.0.53`.
 */
export const READ_AUDIT_LOG_CAPABILITY = 'read:audit_log' as const;
