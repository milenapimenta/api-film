import { registerDecorator, type ValidationOptions } from 'class-validator';

export function IsNonBlankString(
  message: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      name: 'isNonBlankString',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: { ...validationOptions, message },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && value.trim().length > 0;
        },
      },
    });
  };
}
