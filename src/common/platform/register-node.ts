// Side-effect module. Import this as the FIRST import in server.ts.
// It must have no transitive dependencies that call getPlatformServices().
import { registerPlatformServices } from './index';
import { NodePlatformServices } from './NodePlatformServices';

registerPlatformServices(new NodePlatformServices());
