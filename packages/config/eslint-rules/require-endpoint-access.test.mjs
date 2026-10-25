import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';
import { requireEndpointAccess } from './require-endpoint-access.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });

const controller = (body) => `
@Controller('api/v1/x')
export class XController {
${body}
}`;

describe('b2b/require-endpoint-access', () => {
  tester.run('F1.8-AC8: lint kuralı testi', requireEndpointAccess, {
    valid: [
      controller(`  @Get() @RequirePermission('orders.view') list() {}`),
      controller(`  @Public() @Get('health') check() {}`),
      controller(`  @Post('logout') @Authenticated() logout() {}`),
      controller(`  @Delete(':id') @RequirePlatformRole('super_admin') remove() {}`),
      controller(`  helper() {}\n  @Get() @Public() ok() {}`),
      // Controller olmayan sınıf denetlenmez.
      `export class Service { @Get() x() {} }`,
    ],
    invalid: [
      { code: controller(`  @Get() list() {}`), errors: [{ messageId: 'missing' }] },
      {
        code: controller(`  @Post() @HttpCode(204) save() {}`),
        errors: [{ messageId: 'missing' }],
      },
      {
        code: controller(`  @Get() @Public() @RequirePermission('orders.view') both() {}`),
        errors: [{ messageId: 'multiple' }],
      },
      {
        code: controller(`  @Get() @Public() a() {}\n  @Patch() b() {}`),
        errors: [{ messageId: 'missing' }],
      },
    ],
  });
});
