import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { errorBody } from './error-codes';

/**
 * Flatten class-validator's nested ValidationError[] into a flat
 * `{ field: firstMessage }` map. Nested objects use dot paths
 * (e.g. `address.district`). Only the FIRST constraint message per field is
 * kept — that's what a form renders under the input.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const err of errors) {
    const path = parentPath ? `${parentPath}.${err.property}` : err.property;

    if (err.constraints) {
      const first = Object.values(err.constraints)[0];
      if (typeof first === 'string' && first.length > 0) {
        fields[path] = first;
      }
    }

    if (err.children && err.children.length > 0) {
      Object.assign(fields, flattenValidationErrors(err.children, path));
    }
  }

  return fields;
}

/**
 * ValidationPipe `exceptionFactory` — turns class-validator failures into the
 * ONE cataloged validation error: HTTP 422, code VALIDATION_FAILED, with the
 * per-field messages under `details.fields` (ERR-1 §1.1 / §1.4). Never leaks
 * anything beyond the field messages the DTO's own decorators produced.
 */
export function validationExceptionFactory(errors: ValidationError[]): HttpException {
  return new UnprocessableEntityException(
    errorBody('VALIDATION_FAILED', undefined, { fields: flattenValidationErrors(errors) }),
  );
}
