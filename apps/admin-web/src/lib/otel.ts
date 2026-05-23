'use client';

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';

const TEMPO_URL = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces';

export const initOTEL = () => {
  if (typeof window === 'undefined') return;

  const exporter = new OTLPTraceExporter({ url: TEMPO_URL, headers: {} });
  const processor = process.env.NODE_ENV === 'production'
    ? new BatchSpanProcessor(exporter)
    : new SimpleSpanProcessor(exporter);

  // SDK v2: spanProcessors goes in the constructor
  const provider = new WebTracerProvider({
    spanProcessors: [processor],
  });

  provider.register();

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/localhost:3000/, /ngrok-free\.dev/],
        clearTimingResources: true,
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [/localhost:3000/, /ngrok-free\.dev/],
      }),
    ],
  });
};
