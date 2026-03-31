import { Navigate } from "react-router-dom";

// Redirect old route to new PasswordSafe page
export default function PasswordFailures() {
  return <Navigate to="/password-safe" replace />;
}
