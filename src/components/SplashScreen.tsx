import React from "react";

interface SplashScreenProps {
  children: React.ReactNode;
}

/* Splash screen disabled — renders children immediately */
export default function SplashScreen({ children }: SplashScreenProps) {
  return <>{children}</>;
}
