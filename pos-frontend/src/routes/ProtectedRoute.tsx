import { Navigate } from "react-router-dom";

function isAuthenticated() {
  return !!localStorage.getItem("access_token");
}

type Props = { children: JSX.Element };

export default function ProtectedRoute({ children }: Props) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

