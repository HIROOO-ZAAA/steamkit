/**
 * Authentication and OAuth configuration for StreamKit.
 */

export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  YOUTUBE_OAUTH_SCOPE,
].join(" ");

export const GOOGLE_OAUTH_OPTIONS = {
  scopes: GOOGLE_OAUTH_SCOPES,
  queryParams: {
    access_type: "offline",
    prompt: "consent",
  },
};
