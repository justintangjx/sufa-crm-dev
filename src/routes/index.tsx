import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { AppLayout } from "../components/shell/AppLayout";
import { RequireRole, RootRedirect } from "../components/shell/RouteGuards";
import { AdminCampaignDetailPage } from "./admin/AdminCampaignDetailPage";
import { AdminCampaignsPage } from "./admin/AdminCampaignsPage";
import { AdminDashboard } from "./admin/AdminDashboard";
import { AdminExportsPage } from "./admin/AdminExportsPage";
import { AdminPlayersPage } from "./admin/AdminPlayersPage";
import { AdminReviewPage } from "./admin/AdminReviewPage";
import { CoachCampaignPage } from "./coach/CoachCampaignPage";
import { CoachDashboard } from "./coach/CoachDashboard";
import { CoachEvaluationPage } from "./coach/CoachEvaluationPage";
import { PlayerCampaignPage } from "./player/PlayerCampaignPage";
import { PlayerDashboard } from "./player/PlayerDashboard";
import { PlayerProfilePage } from "./player/PlayerProfilePage";
import { AuthCallbackPage } from "./auth/AuthCallbackPage";
import { LoginPage } from "./auth/LoginPage";
import { NotFoundPage } from "./NotFoundPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<RootRedirect />} />
      <Route element={<RequireRole role="player" />}>
        <Route element={<AppLayout />}>
          <Route path="/player" element={<PlayerDashboard />} />
          <Route path="/player/profile" element={<PlayerProfilePage />} />
          <Route path="/player/campaigns/:campaignId" element={<PlayerCampaignPage />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="admin" />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/players" element={<AdminPlayersPage />} />
          <Route path="/admin/campaigns" element={<AdminCampaignsPage />} />
          <Route path="/admin/campaigns/:campaignId" element={<AdminCampaignDetailPage />} />
          <Route path="/admin/review" element={<AdminReviewPage />} />
          <Route path="/admin/exports" element={<AdminExportsPage />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="coach" />}>
        <Route element={<AppLayout />}>
          <Route path="/coach" element={<CoachDashboard />} />
          <Route path="/coach/campaigns/:campaignId" element={<CoachCampaignPage />} />
          <Route
            path="/coach/evaluations/:campaignId/:playerId"
            element={<CoachEvaluationPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

const defaultTestEntries = ["/"];

export function TestApp({ initialEntries = defaultTestEntries }: { initialEntries?: string[] }) {
  return (
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
