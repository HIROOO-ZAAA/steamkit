"use client";

import {
  Suspense,
  useId,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import "../dashboard/dashboard-theme.css";
import { GOOGLE_OAUTH_SCOPES } from "@/config/auth";
import styles from "./auth.module.css";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
  helperText?: string;
}

function AuthField({
  label,
  icon,
  helperText,
  id,
  type = "text",
  ...props
}: AuthFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={styles.inputShell}>
        <span className={styles.fieldIcon} aria-hidden="true">
          {icon}
        </span>
        <input
          {...props}
          id={inputId}
          type={isPassword && showPassword ? "text" : type}
          className={`${styles.input} ${isPassword ? styles.passwordInput : ""}`.trim()}
          aria-describedby={helperId}
        />
        {isPassword ? (
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls={inputId}
            title={showPassword ? "Hide password" : "Show password"}
            disabled={props.disabled}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        ) : null}
      </div>
      {helperText ? (
        <p id={helperId} className={styles.helperText}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      className={styles.googleIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
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
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6v12M8 12l7-6M8 12l7 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(() => {
    switch (searchParams.get("error")) {
      case "google_callback_failed":
        return "Google sign-in failed. Check Supabase and retry.";
      case "google_callback_error":
        return "Google sign-in failed. Please try again.";
      case "google_callback_missing_code":
        return "Google did not return a code. Please try again.";
      default:
        return "";
    }
  });
  const [success, setSuccess] = useState("");

  const supabase = createClient();
  const isBusy = loading || googleLoading;

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
            // Without emailRedirectTo the confirmation mail uses the Supabase
            // project's Site URL (currently localhost). Setting it to the
            // current origin means the link always returns to the right host,
            // whether local or production.
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;

        if (data.session) {
          void logSignIn();
          router.push("/dashboard");
          router.refresh();
        } else {
          setSuccess("Account created! Check your email to verify it.");
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
        setError("Invalid email or password. Please try again.");
      } else if (msg.includes("Email not confirmed")) {
        setError("Email not confirmed. Check your inbox.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError("");
    setSuccess("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: GOOGLE_OAUTH_SCOPES,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
      setGoogleLoading(false);
    }
  }

  function clearFeedback() {
    setError("");
    setSuccess("");
  }

  return (
    <div className={`dashboard-shell ${styles.page}`}>
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Steam Kit home">
          <span className={styles.brandMark}>
            <BrandMark />
          </span>
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>STEAM KIT</span>
            <span className={styles.brandMeta}>Creator control room</span>
          </span>
        </Link>
        <ThemeToggle compact />
      </header>

      <main className={styles.main}>
        <Card hover={false} className={styles.authCard}>
          <div className={styles.header}>
            <h1 id="auth-title" className={styles.title}>
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p id="auth-subtitle" className={styles.subtitle}>
              {mode === "signin"
                ? "Sign in to access your creator dashboard"
                : "Join the next generation of stream creators"}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            className={styles.googleBtn}
            onClick={handleGoogleSignIn}
            disabled={isBusy}
            isLoading={googleLoading}
            aria-busy={googleLoading}
          >
            {!googleLoading ? <GoogleIcon /> : null}
            Continue with Google
          </Button>

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>or continue with email</span>
            <span className={styles.dividerLine} />
          </div>

          <form
            onSubmit={handleSubmit}
            className={styles.form}
            aria-labelledby="auth-title"
            aria-describedby="auth-subtitle"
          >
            {mode === "signup" ? (
              <AuthField
                label="Full Name"
                name="name"
                type="text"
                placeholder="Your name"
                autoComplete="name"
                icon={<UserRound size={17} />}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isBusy}
              />
            ) : null}

            <AuthField
              label="Email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              icon={<Mail size={17} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isBusy}
            />

            <AuthField
              label="Password"
              name="password"
              type="password"
              placeholder={
                mode === "signin" ? "Enter password" : "New password"
              }
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              autoCapitalize="none"
              spellCheck={false}
              icon={<Lock size={17} />}
              helperText={
                mode === "signup" ? "Use at least 6 characters." : undefined
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={isBusy}
            />

            <div className={styles.feedback} aria-live="polite">
              {error ? (
                <div
                  className={`${styles.alert} ${styles.alertError}`}
                  role="alert"
                >
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : success ? (
                <div
                  className={`${styles.alert} ${styles.alertSuccess}`}
                  role="status"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{success}</span>
                </div>
              ) : (
                <p className={styles.feedbackHint}>
                  <ShieldCheck size={13} aria-hidden="true" />
                  <span>Secured by Supabase Auth</span>
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className={styles.submitBtn}
              isLoading={loading}
              disabled={isBusy}
              aria-busy={loading}
            >
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className={styles.toggle}>
            {mode === "signin"
              ? "Don't have an account? "
              : "Already have an account? "}
            <Link
              href={mode === "signin" ? "/auth?mode=signup" : "/auth?mode=signin"}
              className={styles.toggleLink}
              onClick={(event) => {
                if (isBusy) {
                  event.preventDefault();
                  return;
                }
                clearFeedback();
              }}
              aria-disabled={isBusy}
            >
              {mode === "signin" ? "Sign up free" : "Sign in"}
            </Link>
          </p>
        </Card>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div
          className={`dashboard-shell ${styles.page}`}
          role="status"
          aria-live="polite"
        >
          <div className={styles.loading}>Loading secure sign-in...</div>
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
