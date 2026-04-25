import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  onClose: () => void;
};

export default function SignIn({ onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="signin-backdrop" onClick={onClose}>
      <div className="signin-card" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button className="signin-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {/* Brand mark */}
        <div className="signin-mark" />

        {/* Headings */}
        <p className="eyebrow" style={{ color: "var(--cyan)", marginBottom: 10 }}>
          NOSTALGIA · AR
        </p>
        <h2 className="signin-title">Welcome back</h2>
        <p className="signin-sub">Sign in to save your scores and climb the leaderboard.</p>

        {/* Google button */}
        <button className="signin-google" onClick={handleGoogle} disabled={loading}>
          <GoogleIcon />
          {loading ? "Redirecting\u2026" : "Continue with Google"}
        </button>

        {error && (
          <p style={{ color: "#ff6b6b", fontSize: 13, textAlign: "center", margin: "10px 0 0" }}>
            {error}
          </p>
        )}

        {/* Divider */}
        <div className="signin-divider">
          <span />
          <span className="signin-divider-label">or</span>
          <span />
        </div>

        {/* Email placeholder */}
        <input
          className="signin-input"
          type="email"
          placeholder="Email address"
          autoComplete="email"
        />
        <input
          className="signin-input"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
        />
        <button className="btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
          Sign In
        </button>

        <p className="signin-footer">
          Don't have an account?{" "}
          <a href="#" style={{ color: "var(--cyan)" }}>
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9086c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9086-2.2581c-.8055.54-1.8368.859-3.0477.859-2.3446 0-4.3282-1.5836-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1632 6.6554 3.5795 9 3.5795z"
        fill="#EA4335"
      />
    </svg>
  );
}
