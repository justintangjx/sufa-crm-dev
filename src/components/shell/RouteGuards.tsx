import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { getRoleHome } from "../../lib/roles";
import type { Role } from "../../types/database";
import { LoadingPage } from "./PagePrimitives";

export function RootRedirect() {
  const { profile, loading } = useAuth();
  if (loading) {
    return <LoadingPage />;
  }
  return <Navigate to={profile ? getRoleHome(profile.role) : "/login"} replace />;
}

export function RequireRole({ role }: { role: Role }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return <LoadingPage />;
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  if (profile.role !== role) {
    return <Navigate to={getRoleHome(profile.role)} replace />;
  }
  return <Outlet />;
}
