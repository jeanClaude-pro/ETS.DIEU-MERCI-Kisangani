import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { toast } from "react-toastify";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // If not logged in, show toast once
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      toast.error("You must be logged in to access this page.");
    }
  }, [loading, isAuthenticated]);

  if (loading) return null; // or a spinner
  if (!isAuthenticated)
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
};
