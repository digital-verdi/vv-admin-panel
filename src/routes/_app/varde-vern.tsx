import { createFileRoute, redirect } from '@tanstack/react-router';

// Varde Vern folded into the LLM Router page (a tab). Redirect the old top-level URL for at least one
// release so bookmarks/links keep working.
export const Route = createFileRoute('/_app/varde-vern')({
  beforeLoad: () => {
    throw redirect({ to: '/llm-router', search: { tab: 'varde-vern' } });
  },
  component: () => null,
});
