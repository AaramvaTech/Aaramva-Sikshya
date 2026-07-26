import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Non-negative decimal string, up to 2 fractional digits. No thousands
// separators, no leading '+', no leading-dot shorthand. "1234", "1234.5" and
// "1234.56" all match; "1234.567", "-1", "1,234.56" and "1234.56" as a JS
// number (not a string) do not.
const MONEY_STRING_RE = /^\d+(\.\d{1,2})?$/;

/**
 * BILL-0: the finance DTOs typed money as JS `number` via @IsNumber(), so a
 * value could lose precision in JSON parse before Money ever saw it. This
 * validator closes that hole at the API edge — money arrives as an exact
 * decimal string (or integer-rupee string) and is never round-tripped
 * through a JS float on the way in.
 */
export function IsMoneyString(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isMoneyString',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && MONEY_STRING_RE.test(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a non-negative decimal string with up to 2 decimal places (e.g. "1234.56"), not a number`;
        },
      },
    });
  };
}
