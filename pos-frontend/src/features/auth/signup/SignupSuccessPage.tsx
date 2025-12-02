import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { clearSignupState } from "./state";

export default function SignupSuccessPage() {
  React.useEffect(() => {
    clearSignupState();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-2xl backdrop-blur text-center"
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h1 className="mt-4 text-3xl font-semibold">You’re all set!</h1>
        <p className="mt-2 text-muted-foreground">
          Your tenant and trial subscription are ready. Sign in to continue onboarding.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:bg-primary/90"
        >
          Go to login
        </Link>
      </motion.div>
    </div>
  );
}
