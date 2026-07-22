# Authentication, Google OAuth, & Rate Limiting Design

## Overview
This document outlines the design for upgrading the MedNAMA authentication system. The upgrade introduces rate limiting to protect endpoints, a standard email-based password reset flow, and Google OAuth2 (Backend-First flow) for seamless user onboarding, while preserving the existing JWT-based session architecture.

## 1. Database Schema Updates
The `User` model (`app/models.py`) will be updated to include new fields, and a new table will be introduced for password reset tokens.

### `users` table additions:
- `email` (String, Unique, Nullable for legacy users without emails)
- `display_name` (String, Nullable, populated via Google Auth or left blank)

### `password_reset_tokens` table:
- `id` (Integer, Primary Key)
- `user_id` (Integer, Foreign Key to `users.id`)
- `token_hash` (String)
- `expires_at` (DateTime)

## 2. Rate Limiting (SlowAPI)
To protect against brute-force attacks and abuse of AI models, we will integrate `slowapi` into the FastAPI backend. Tracking will be in-memory (resets on server restart).

### Limits:
- **Auth Routes (`/api/auth/*`)**: 5 requests per minute per IP.
- **AI Generation (`/api/chat/*`, `/api/mcqs/explain`)**: 10 requests per minute per IP.

## 3. Email & Password Resets
We will implement a standard secure password reset flow.

### Backend Endpoints:
- `POST /api/auth/forgot-password`: Accepts an email. If the user exists, generates a secure random token, hashes it for the database, and sends the raw token via an SMTP email dispatch.
- `POST /api/auth/reset-password`: Accepts the token and a new password. Validates the token against the hash and expiration date, then updates the user's password.

### Frontend Views:
- **Forgot Password View**: A simple form to input an email address.
- **Reset Password View**: A form to input a new password (accessible via the emailed link, e.g., `/reset-password?token=XYZ`).

## 4. Google Auth (Backend-First OAuth2 Flow)
We will use the standard OAuth2 Authorization Code flow managed entirely by the backend, ensuring high security and no frontend token exposure.

### Flow:
1. **Initiation**: User clicks "Continue with Google" on the frontend. The button is a standard anchor link pointing to `GET /api/auth/google/login`.
2. **Redirection**: The backend uses an OAuth library (e.g., `authlib` or `httpx` to Google's auth URL) to redirect the user's browser to the Google Consent screen.
3. **Callback**: Google redirects the user back to `GET /api/auth/google/callback` with an authorization `code`.
4. **Token Exchange**: The backend exchanges the `code` for an access token/ID token and fetches the user's Google profile (email, name).
5. **User Resolution**:
   - If a user with that email exists, log them in.
   - If not, auto-generate a `username` (e.g., based on email prefix, appending digits if necessary), set their `email` and `display_name`, and create the account.
6. **Session Creation**: The backend generates a standard MedNAMA JWT (the same one used for password logins).
7. **Final Redirection**: The backend responds with an HTTP redirect (e.g., `302 Found`) back to the frontend dashboard, setting the JWT in an HTTP-only cookie OR appending it as a short-lived secure hash in the URL to be instantly consumed by the frontend and stored. *(Implementation detail: Since the current app likely uses a Bearer token stored in localStorage, the backend will redirect to `/auth/callback?token=JWT` and the frontend will immediately parse it, store it, and strip it from the URL).*

## Scope & Implementation Notes
- **SMTP**: Requires valid SMTP credentials in the `.env` file (e.g., Gmail App Password).
- **Google Cloud Console**: Requires setting up a Google OAuth Client ID and Secret, with the authorized redirect URI pointing to `http://localhost:8000/api/auth/google/callback`.
