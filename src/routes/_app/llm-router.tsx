import { createFileRoute } from '@tanstack/react-router';
import { LlmRouterPage } from '@/components/llm-router';

export const Route = createFileRoute('/_app/llm-router')({
  component: LlmRouterPage,
});
