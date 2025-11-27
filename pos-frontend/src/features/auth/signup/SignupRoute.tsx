import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import SignupStartPage from "./SignupStartPage";
import SignupVerifyPage from "./SignupVerifyPage";
import SignupProfilePage from "./SignupProfilePage";
import SignupPlanPage from "./SignupPlanPage";
import SignupSuccessPage from "./SignupSuccessPage";

export default function SignupRoute() {
  return (
    <Routes>
      <Route path="/start" element={<SignupStartPage />} />
      <Route path="/verify" element={<SignupVerifyPage />} />
      <Route path="/profile" element={<SignupProfilePage />} />
      <Route path="/plan" element={<SignupPlanPage />} />
      <Route path="/success" element={<SignupSuccessPage />} />
      <Route path="*" element={<Navigate to="/signup/start" replace />} />
    </Routes>
  );
}
