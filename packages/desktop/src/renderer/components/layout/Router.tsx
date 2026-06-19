import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useEntitlementGate } from '@renderer/hooks/useEntitlementGate';
import { isElectronDesktop } from '@renderer/utils/platform';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/AppearanceSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const BillingSettings = React.lazy(() => import('@renderer/pages/settings/BillingSettings'));
const AccountSettings = React.lazy(() => import('@renderer/pages/settings/AccountSettings'));
const PrivacySettings = React.lazy(() => import('@renderer/pages/settings/PrivacySettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));
const CommandCenterPage = React.lazy(() => import('@renderer/pages/commandCenter'));
const ConnectorCatalogPage = React.lazy(() => import('@renderer/pages/connectorCatalog'));
const SkillLibraryPage = React.lazy(() => import('@renderer/pages/skillLibrary'));
const LocalRuntimePage = React.lazy(() => import('@renderer/pages/localRuntime'));
const DeinTeamPage = React.lazy(() => import('@renderer/pages/deinTeam'));
const RegistrationGatePage = React.lazy(() => import('@renderer/pages/registrationGate'));
const DayZeroOnboardingHost = React.lazy(() => import('@renderer/components/billing/DayZeroOnboardingHost'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

export const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();
  const { loading: gateLoading, status: gateStatus, blocked: gateBlocked, refresh: refreshGate } = useEntitlementGate();

  if (status === 'checking' || gateLoading) {
    return <AppLoader />;
  }

  // Command EVE registration + license gate (W12) — checked FIRST. The gate is a
  // STRUCTURAL guard: while it is required and not entitled, it replaces the
  // protected layout entirely, so every protected route — including the index
  // redirect and the `*` catch-all — renders the gate (web login/register) instead
  // of any main surface. No route, deep link, or window reopen can reach a main
  // surface from here. It is fail-closed + E2E-proven, and on the Electron desktop
  // it is the SOLE source of truth, so it precedes the auth-status redirect below.
  if (gateBlocked) {
    return (
      <Suspense fallback={<AppLoader />}>
        <RegistrationGatePage status={gateStatus} onEntitled={refreshGate} />
      </Suspense>
    );
  }

  // Auth-status backstop — WebUI ONLY. On the Electron desktop there is no web
  // /login surface (the entitlement gate above IS the login), and desktop `status`
  // is honest (entitlement-derived) but must NOT act as a second, independently-
  // disagreeing redirect — that would risk a /login <-> /guid loop on a
  // momentarily-stale status. So this redirect is scoped to non-desktop builds.
  if (!isElectronDesktop() && status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  // Entitled: render the main layout. Mount the Day-0 onboarding host alongside
  // it — it self-quiets unless this is a first run with no Company-Brain seed.
  return (
    <>
      {React.cloneElement(layout)}
      <Suspense fallback={null}>
        <DayZeroOnboardingHost entitled />
      </Suspense>
    </>
  );
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route
          path='/login'
          element={
            // Desktop has no web /login surface — the entitlement gate (rendered by
            // ProtectedLayout on /guid) is the login. Send desktop to /guid so the
            // gate decides; WebUI keeps the real LoginPage when unauthenticated.
            isElectronDesktop() || status === 'authenticated' ? <Navigate to='/guid' replace /> : withRouteFallback(LoginPage)
          }
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route
            path='/team/:id'
            element={TEAM_MODE_ENABLED ? withRouteFallback(TeamIndex) : <Navigate to='/guid' replace />}
          />
          <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />
          <Route path='/settings/assistants' element={withRouteFallback(AssistantSettings)} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/capabilities' element={withRouteFallback(CapabilitiesSettings)} />
          {/* Legacy routes — redirect to the merged /settings/capabilities page */}
          <Route path='/settings/skills-hub' element={<Navigate to='/settings/capabilities?tab=skills' replace />} />
          <Route path='/settings/tools' element={<Navigate to='/settings/capabilities?tab=tools' replace />} />
          <Route path='/settings/appearance' element={withRouteFallback(AppearanceSettings)} />
          <Route path='/settings/display' element={<Navigate to='/settings/appearance' replace />} />
          <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
          <Route path='/settings/pet' element={withRouteFallback(PetSettings)} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/billing' element={withRouteFallback(BillingSettings)} />
          <Route path='/settings/account' element={withRouteFallback(AccountSettings)} />
          <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/privacy' element={withRouteFallback(PrivacySettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/model' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:job_id' element={withRouteFallback(TaskDetailPage)} />
          <Route path='/command-center' element={withRouteFallback(CommandCenterPage)} />
          <Route path='/connectors' element={withRouteFallback(ConnectorCatalogPage)} />
          <Route path='/skills' element={withRouteFallback(SkillLibraryPage)} />
          <Route path='/runtime' element={withRouteFallback(LocalRuntimePage)} />
          <Route path='/team-roster' element={withRouteFallback(DeinTeamPage)} />
        </Route>
        <Route path='*' element={<Navigate to={isElectronDesktop() || status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
