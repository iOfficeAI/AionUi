import { AcpAgent } from '../agent/acp';
import { forkTask } from './utils';

// [B] Worker process startup — log PATH visible inside the worker
if (process.env.AION_ENV_DEBUG === '1') {
  const sep = process.platform === 'win32' ? ';' : ':';
  const pathEntries = process.env.PATH?.split(sep) ?? [];
  console.log(`[EnvDebug][B-AcpWorker] worker started, PATH entries: ${pathEntries.length}`);
  console.log(`[EnvDebug][B-AcpWorker] PATH[:5]: ${pathEntries.slice(0, 5).join(', ')}`);
}

export default forkTask(({ data }, pipe) => {
  const agent = new AcpAgent({
    ...data,
    onStreamEvent(data) {
      pipe.call('acp.message', data);
    },
  });
  pipe.on('stop.stream', (_, deferred) => {
    deferred.with(agent.stop());
  });
  pipe.on('send.message', (data, deferred) => {
    deferred.with(agent.sendMessage(data));
  });
  return agent.start();
});
