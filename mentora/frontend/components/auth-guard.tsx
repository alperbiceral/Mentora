import { ReactNode } from "react";
import { Redirect } from "expo-router";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const token =
    typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    return <Redirect href="/login" />;
  }

  return <>{children}</>;
}
