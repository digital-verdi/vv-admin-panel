import client, { register } from 'prom-client';

client.collectDefaultMetrics();

export const httpRequestsTotal = new client.Counter({
  name: 'admin_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'] as const,
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'admin_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export async function metricsResponse(): Promise<Response> {
  const data = await register.metrics();
  return new Response(data, {
    headers: { 'Content-Type': register.contentType },
  });
}
