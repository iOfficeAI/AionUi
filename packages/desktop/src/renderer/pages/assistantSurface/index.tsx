import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { getAssistantSurface, isAssistantSurfaceAvailable } from './registry';
import { getAssistantSurfaceStateScope } from './storage';
import AssistantSurfaceErrorBoundary from './shell/AssistantSurfaceErrorBoundary';
import ForecastAssistantSurface from './ForecastAssistantSurface';

const AssistantSurfacePage: React.FC = () => {
  const { user, refresh } = useAuth();
  const { surfaceId, businessView } = useParams<{ surfaceId: string; businessView?: string }>();
  const surface = getAssistantSurface(surfaceId);

  if (!surface || surface.id === 'general' || !isAssistantSurfaceAvailable(surface)) {
    return <Navigate to='/guid' replace />;
  }

  if (businessView !== undefined && businessView !== 'messages') {
    return <Navigate to={surface.route} replace />;
  }

  const userId = user?.id ?? (window.__aionuiE2ETest ? 'e2e-user' : 'anonymous');
  const stateScope = getAssistantSurfaceStateScope(
    userId,
    surface.id,
    window.__aionuiAssistantSurfaceFixtures === true
  );

  const draftStorageScope =
    user?.id && user.environmentId && user.tenantId
      ? JSON.stringify([user.environmentId, user.tenantId, user.id])
      : undefined;

  return (
    <AssistantSurfaceErrorBoundary fallback={<Navigate to='/guid' replace />}>
      <ForecastAssistantSurface
        key={draftStorageScope ?? stateScope}
        stateScope={stateScope}
        businessView={businessView}
        permissionCodes={user?.permissionCodes}
        draftStorageScope={draftStorageScope}
        onRefreshPermissions={refresh}
      />
    </AssistantSurfaceErrorBoundary>
  );
};

export default AssistantSurfacePage;
