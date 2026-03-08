import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { toast } from "react-toastify";

export const RequireAuth: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { token, loading } = useAuth();
  const location = useLocation();

  // If not logged in, show toast once
  useEffect(() => {
    if (!loading && !token) {
      toast.error("You must be logged in to access this page.");
    }
  }, [loading, token]);

  if (loading) return null; // or a spinner
  if (!token)
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
};
