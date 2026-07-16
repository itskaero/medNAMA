"use client";

import React from "react";
import { Stethoscope, AlertCircle } from "lucide-react";

interface AuthCardProps {
  isRegisterMode: boolean;
  setIsRegisterMode: (v: boolean) => void;
  authError: string | null;
  authUsername: string;
  setAuthUsername: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authRole: string;
  setAuthRole: (v: string) => void;
  isAuthLoading: boolean;
  handleAuthSubmit: (e: React.FormEvent) => void;
}

export default function AuthCard({
  isRegisterMode,
  setIsRegisterMode,
  authError,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  authRole,
  setAuthRole,
  isAuthLoading,
  handleAuthSubmit,
}: AuthCardProps) {
  return (
    <div className="auth-shell">
      <div className="auth-card" role="main">
        <div className="auth-logo">
          <div className="auth-brand-mark" aria-hidden>
            <Stethoscope size={26} />
          </div>
          <div>
            <h1 className="auth-title">
              med<span>NAMA</span>
            </h1>
            <p className="auth-subtitle">
              {isRegisterMode
                ? "Create your clinical workspace account"
                : "Sign in to access your medical knowledge base"}
            </p>
          </div>
        </div>

        {authError && (
          <div className="auth-error" role="alert">
            <AlertCircle size={14} />
            {authError}
          </div>
        )}

        <form onSubmit={handleAuthSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="auth-username">
              Username
            </label>
            <input
              id="auth-username"
              type="text"
              className="field-input"
              placeholder="Enter your username"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              className="field-input"
              placeholder="Enter your password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              autoComplete={isRegisterMode ? "new-password" : "current-password"}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isAuthLoading}>
            {isAuthLoading
              ? "Authenticating…"
              : isRegisterMode
              ? "Create account"
              : "Sign in"}
          </button>
        </form>

        {!isRegisterMode && (
          <div className="quick-creds">
            <div className="quick-creds-label">Quick start credentials</div>
            <div className="quick-creds-row">
              <button
                className="quick-cred-btn"
                type="button"
                onClick={() => {
                  setAuthUsername("admin");
                  setAuthPassword("admin123");
                }}
              >
                Admin
              </button>
              <button
                className="quick-cred-btn"
                type="button"
                onClick={() => {
                  setAuthUsername("student");
                  setAuthPassword("student123");
                }}
              >
                Student
              </button>
            </div>
          </div>
        )}

        <div className="auth-switch">
          {isRegisterMode ? (
            <>
              Already have an account?{" "}
              <button
                className="auth-switch-btn"
                type="button"
                onClick={() => setIsRegisterMode(false)}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New to medNAMA?{" "}
              <button
                className="auth-switch-btn"
                type="button"
                onClick={() => {
                  setIsRegisterMode(true);
                  setAuthRole("student");
                }}
              >
                Create account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
