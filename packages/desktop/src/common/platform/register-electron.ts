// Side-effect module. Import this as the FIRST import in src/process/index.ts.
import { registerPlatformServices } from './index';
import { ElectronPlatformServices } from './ElectronPlatformServices';

registerPlatformServices(new ElectronPlatformServices());
