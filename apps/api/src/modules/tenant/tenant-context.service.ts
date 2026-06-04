import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The per-request tenant context, carried implicitly through the async call
 * chain via AsyncLocalStorage — no need to thread it through every function.
 */
export interface TenantContext {
  tenantId: string;
  slug: string;
  schemaName: string; // e.g. "tenant_sxs"
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  /**
   * Run `callback` with the given tenant context bound for its entire async
   * lifetime. Anything awaited inside can call get() and see this context.
   */
  run<T>(context: TenantContext, callback: () => T): T {
    return this.als.run(context, callback);
  }

  /** The current tenant context, or undefined if outside a tenant-scoped request. */
  get(): TenantContext | undefined {
    return this.als.getStore();
  }

  /** Like get(), but throws if there is no tenant in scope. */
  getOrThrow(): TenantContext {
    const ctx = this.als.getStore();
    if (!ctx) {
      throw new Error(
        'No tenant context in scope. Is TenantMiddleware applied to this route?',
      );
    }
    return ctx;
  }
}
