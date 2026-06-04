import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: null;
}

/**
 * Wraps every successful controller response in the standard envelope:
 *   { success: true, data: <payload>, meta: null }
 *
 * Paginated responses can return { data, meta } directly and the outer
 * envelope will preserve the meta field.
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        const res = context.switchToHttp().getResponse<{ statusCode: number }>();
        if (res.statusCode === 204) return data as any;
        return {
          success: true as const,
          data,
          meta: null,
        };
      }),
    );
  }
}
