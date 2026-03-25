// register-node MUST be the first import — registers NodePlatformServices before
// any module-level code in the agent dependency tree calls getPlatformServices().
import '../../common/platform/register-node';
import { AcpAgent } from '../agent/acp';
import { forkTask } from './utils';

export default forkTask(({ data }, pipe) => {
  const agent = new AcpAgent({
    ...data,
    onStreamEvent(data) {
      pipe.call('acp.message', data);
    },
  });
  pipe.on('send.message', (data, deferred) => {
    deferred.with(agent.sendMessage(data));
  });
  return agent.start();
});
