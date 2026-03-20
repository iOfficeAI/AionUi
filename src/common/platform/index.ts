import type { IPlatformServices } from './IPlatformServices'

let _services: IPlatformServices | null = null

export function registerPlatformServices(services: IPlatformServices): void {
  _services = services
}

export function getPlatformServices(): IPlatformServices {
  if (!_services) {
    throw new Error(
      '[Platform] Services not registered. Call registerPlatformServices() before using platform APIs.',
    )
  }
  return _services
}

export type {
  IPlatformServices,
  IPlatformPaths,
  IWorkerProcess,
  IWorkerProcessFactory,
  IPowerManager,
  INotificationService,
} from './IPlatformServices'
