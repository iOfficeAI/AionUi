import { ipcBridge } from '@/common';
import { Spin } from '@arco-design/web-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import TeamPage from './TeamPage';
import { useTeamList } from './hooks/useTeamList';

const TeamIndex: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { teams } = useTeamList();
  const cachedTeam = id ? teams.find((item) => item.id === id) : undefined;

  const { data: team, isLoading } = useSWR(id ? `team/${id}` : null, () => ipcBridge.team.get.invoke({ id: id! }), {
    fallbackData: cachedTeam,
  });

  if (isLoading && !team) return <Spin loading />;
  if (!team) return null;
  return <TeamPage key={team.id} team={team} />;
};

export default TeamIndex;
