import { AcpAgent } from '../agent/acp';
import { forkTask } from './utils';

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
