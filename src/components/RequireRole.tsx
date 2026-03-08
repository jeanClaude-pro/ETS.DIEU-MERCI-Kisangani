import React from "react";
import { useAuth } from "../hooks/useAuth";

export const RequireRole: React.FC<
  React.PropsWithChildren<{ role: "admin" | "staff" }>
> = ({ role, children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== role)
    return <div className="p-6">Unauthorized</div>;
  return <>{children}</>;
};
