'use client';

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { ZoneContextManager } from '@opentelemetry/context-manager-zone';

const TEMPO_URL = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces';

export const initOTEL = () => {
  if (typeof window === 'undefined') return;

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'admin-web',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NEXT_PUBLIC_ENV || 'development',
  });

  const provider = new WebTracerProvider({ resource });

  // Use OTLP Exporter to send traces to Tempo
  const exporter = new OTLPTraceExporter({
    url: TEMPO_URL,
    headers: {}, // Add any custom headers if needed
  });

  // BatchSpanProcessor is better for production, Simple is good for dev
  const processor = process.env.NODE_ENV === 'production' 
    ? new BatchSpanProcessor(exporter) 
    : new SimpleSpanProcessor(exporter);

  provider.addSpanProcessor(processor);

  // Register the provider with the context manager
  provider.register({
    contextManager: new ZoneContextManager(),
  });

  // Automatically instrument fetch and XHR
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [
          /localhost:3000/, 
          /api\.bingo\.com/
        ],
        clearTimingResources: true,
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [
          /localhost:3000/,
          /api\.bingo\.com/
        ],
      }),
    ],
  });

  console.log('[OTEL] Browser instrumentation initialized');
};
