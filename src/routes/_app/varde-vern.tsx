import { createFileRoute } from '@tanstack/react-router';
import { VardeVernPage } from '@/components/varde-vern';

export const Route = createFileRoute('/_app/varde-vern')({
  component: VardeVernPage,
});
