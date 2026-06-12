// apps/api/src/modules/common/decorators/client-type.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type ClientType = 'web' | 'mobile';

export const ClientType = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientType => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    return request.headers['x-client-type'] === 'mobile' ? 'mobile' : 'web';
  },
);
