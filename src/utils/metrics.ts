type HttpMetrics = {
  total: number;
  byStatusClass: Record<string, number>;
  averageLatencyMs: number;
  lastUpdatedAt: string | null;
};

const httpMetrics: HttpMetrics = {
  total: 0,
  byStatusClass: {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
  },
  averageLatencyMs: 0,
  lastUpdatedAt: null,
};

export function trackHttp(statusCode: number, latencyMs: number) {
  httpMetrics.total += 1;
  const cls = `${Math.floor(statusCode / 100)}xx`;
  httpMetrics.byStatusClass[cls] = (httpMetrics.byStatusClass[cls] ?? 0) + 1;
  // Streaming average keeps memory usage constant.
  httpMetrics.averageLatencyMs =
    (httpMetrics.averageLatencyMs * (httpMetrics.total - 1) + latencyMs) / httpMetrics.total;
  httpMetrics.lastUpdatedAt = new Date().toISOString();
}

export function snapshotMetrics() {
  return {
    process: {
      uptimeSec: Math.round(process.uptime()),
      memoryRssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
      nodeVersion: process.version,
    },
    http: {
      total: httpMetrics.total,
      byStatusClass: { ...httpMetrics.byStatusClass },
      averageLatencyMs: Number(httpMetrics.averageLatencyMs.toFixed(2)),
      lastUpdatedAt: httpMetrics.lastUpdatedAt,
    },
  };
}
