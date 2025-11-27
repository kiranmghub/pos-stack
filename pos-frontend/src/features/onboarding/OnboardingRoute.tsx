import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import OnboardingWizard from "./OnboardingWizard";

export default function OnboardingRoute() {
  return (
    <Routes>
      <Route path="/" element={<OnboardingWizard />} />
      <Route path="*" element={<Navigate to="/onboarding" replace />} />
    </Routes>
  );
}
