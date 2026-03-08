"use client";
import * as React from "react";
import { AuthContext } from "../context/auth-context";

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
