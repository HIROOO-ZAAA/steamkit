"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SteamKitMark } from "@/components/ui/SteamKitMark";
import styles from "./auth.module.css";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(() =>
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    switch (searchParams.get("error")) {
      case "google_callback_failed":
        return "Google signed in, but StreamKit could not finish the session. Check the Supabase redirect URL and the app's Supabase project settings, then try again.";
      case "google_callback_error":
        return "StreamKit hit a server error while finishing Google sign-in. Please try again; if it continues, check the server logs.";
      case "google_callback_missing_code":
        return "Google sign-in returned without an authorization code. Check the Google and Supabase callback URLs, then try again.";
      default:
        return "";
    }
  });
  const [success, setSuccess] = useState("");

  const supabase = createClient();

  // Best-effort audit trail; a failed log must never block sign-in.
  async function logSignIn() {
    try {
      await fetch("/api/auth/session-log", { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (error) throw error;

        if (data.session) {
          void logSignIn();
          router.push("/dashboard");
          router.refresh();
        } else {
          setSuccess(
            "Account created! Please check your email to verify your account.",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        void logSignIn();
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      if (msg.includes("Invalid login credentials")) {
        setError("Invalid email or password. Have you created an account yet?");
      } else if (msg.includes("Email not confirmed")) {
        setError(
          'Email not confirmed. Check your inbox or turn off "Confirm email" in Supabase.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.glow} />

      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          <SteamKitMark size={30} />
          <span className="text-gradient">Nexus</span>
        </Link>
      </nav>

      <div className={styles.wrapper}>
        <Card glow className={styles.authCard}>
          <div className={styles.header}>
            <h1 className={styles.title}>
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className={styles.subtitle}>
              {mode === "signin"
                ? "Sign in to access your creator dashboard"
                : "Join the next generation of stream creators"}
            </p>
          </div>

          <Button
            variant="secondary"
            className={styles.googleBtn}
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className={styles.divider}>
            <span className="divider" />
            <span className={styles.dividerText}>or continue with email</span>
            <span className="divider" />
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {mode === "signup" && (
              <Input
                label="Full Name"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
              />
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />

            {error && <div className="alert-error">{error}</div>}
            {success && <div className="alert-success">{success}</div>}

            <Button
              type="submit"
              size="lg"
              className={styles.submitBtn}
              isLoading={loading}
            >
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className={styles.divider}>
            <span className="divider" />
            <span className={styles.dividerText}>or</span>
            <span className="divider" />
          </div>

          <p className={styles.toggle}>
            {mode === "signin"
              ? "Don't have an account? "
              : "Already have an account? "}
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
                setSuccess("");
              }}
            >
              {mode === "signin" ? "Sign up free" : "Sign in"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div style={{ background: "var(--bg-base)", minHeight: "100vh" }} />
      }
    >
      <AuthForm />
    </Suspense>
  );
}
