import type { AppEnv } from '@b2b/shared';

export { DevModule } from './dev.module';

/** `/api/v1/dev/*` uçlarının açık olduğu ortamlar (NFR-96). */
const DEV_MODULE_ENVS: ReadonlySet<AppEnv> = new Set<AppEnv>(['local', 'test', 'staging']);

export function isDevModuleEnabled(appEnv: AppEnv): boolean {
  return DEV_MODULE_ENVS.has(appEnv);
}
