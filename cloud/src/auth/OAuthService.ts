/**
 * OAuthService — handles Google, GitHub, and Facebook OAuth flows.
 *
 * Flow:
 * 1. Web app redirects to /auth/{provider} with redirect_uri
 * 2. API redirects to provider's authorization URL
 * 3. Provider redirects back to /auth/{provider}/callback with code
 * 4. API exchanges code for tokens, fetches user profile
 * 5. API creates or links user, issues JWT
 * 6. API redirects to web app with tokens
 */

import { getConfig } from '../config.js';
import { prisma } from '../db.js';

const log = {
  info: (...args: unknown[]) => console.log('[OAuthService]', ...args),
  error: (...args: unknown[]) => console.error('[OAuthService]', ...args),
};

export interface OAuthProfile {
  provider: 'google' | 'github' | 'facebook';
  providerId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

// ── Provider Config ─────────────────────────────────────────────────────────

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  profileUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

function getProviderConfig(provider: string): ProviderConfig | null {
  const config = getConfig();

  switch (provider) {
    case 'google':
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return null;
      return {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        scopes: ['openid', 'email', 'profile'],
      };

    case 'github':
      if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) return null;
      return {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        profileUrl: 'https://api.github.com/user',
        clientId: config.GITHUB_CLIENT_ID,
        clientSecret: config.GITHUB_CLIENT_SECRET,
        scopes: ['user:email', 'read:user'],
      };

    case 'facebook':
      if (!config.FACEBOOK_APP_ID || !config.FACEBOOK_APP_SECRET) return null;
      return {
        authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
        profileUrl: 'https://graph.facebook.com/me?fields=id,name,email,picture.type(large)',
        clientId: config.FACEBOOK_APP_ID,
        clientSecret: config.FACEBOOK_APP_SECRET,
        scopes: ['email', 'public_profile'],
      };

    default:
      return null;
  }
}

// ── Authorization URL ───────────────────────────────────────────────────────

export function getAuthorizationUrl(
  provider: string,
  redirectUri: string,
  state: string,
): string | null {
  const config = getProviderConfig(provider);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  // Google-specific params
  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return `${config.authUrl}?${params.toString()}`;
}

// ── Token Exchange ──────────────────────────────────────────────────────────

async function exchangeCodeForToken(
  provider: string,
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const config = getProviderConfig(provider);
  if (!config) return null;

  const body: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
  };

  // GitHub uses different param name
  if (provider === 'github') {
    // GitHub doesn't use grant_type
  } else {
    body.grant_type = 'authorization_code';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // GitHub needs Accept header for JSON
  if (provider === 'github') {
    headers['Accept'] = 'application/json';
  }

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body).toString(),
  });

  const data = await res.json();

  if (provider === 'github') {
    return (data as { access_token?: string }).access_token ?? null;
  }
  return (data as { access_token?: string }).access_token ?? null;
}

// ── Profile Fetching ────────────────────────────────────────────────────────

async function fetchProfile(provider: string, accessToken: string): Promise<OAuthProfile | null> {
  const config = getProviderConfig(provider);
  if (!config) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  // GitHub uses different auth header
  if (provider === 'github') {
    headers['Authorization'] = `token ${accessToken}`;
    headers['User-Agent'] = 'RecoMe-Cloud';
  }

  const res = await fetch(config.profileUrl, { headers });
  if (!res.ok) {
    log.error(`Failed to fetch ${provider} profile: ${res.status}`);
    return null;
  }

  const data = await res.json();

  switch (provider) {
    case 'google': {
      const g = data as { id: string; email: string; name?: string; picture?: string };
      return {
        provider: 'google',
        providerId: g.id,
        email: g.email,
        name: g.name,
        avatarUrl: g.picture,
      };
    }

    case 'github': {
      const gh = data as {
        id: number;
        login: string;
        name?: string;
        email?: string;
        avatar_url?: string;
      };
      // GitHub may not return email — need to fetch separately
      let email = gh.email;
      if (!email) {
        const emailRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primary = emails.find((e) => e.primary && e.verified);
          email = primary?.email ?? emails[0]?.email;
        }
      }
      if (!email) return null; // Can't create account without email

      return {
        provider: 'github',
        providerId: String(gh.id),
        email,
        name: gh.name ?? gh.login,
        avatarUrl: gh.avatar_url,
      };
    }

    case 'facebook': {
      const fb = data as {
        id: string;
        name?: string;
        email?: string;
        picture?: { data?: { url?: string } };
      };
      if (!fb.email) return null;
      return {
        provider: 'facebook',
        providerId: fb.id,
        email: fb.email,
        name: fb.name,
        avatarUrl: fb.picture?.data?.url,
      };
    }

    default:
      return null;
  }
}

// ── Find or Create User ─────────────────────────────────────────────────────

export async function findOrCreateOAuthUser(
  profile: OAuthProfile,
): Promise<{ id: string; email: string; tier: string; isNew: boolean }> {
  const providerField = `${profile.provider}Id` as 'googleId' | 'githubId' | 'facebookId';

  // 1. Check if user exists by provider ID
  const existingByProvider = await prisma.user.findFirst({
    where: { [providerField]: profile.providerId },
  });
  if (existingByProvider) {
    // Update avatar/name if changed
    await prisma.user.update({
      where: { id: existingByProvider.id },
      data: {
        avatarUrl: profile.avatarUrl ?? existingByProvider.avatarUrl,
        displayName: profile.name ?? existingByProvider.displayName,
      },
    });
    return {
      id: existingByProvider.id,
      email: existingByProvider.email,
      tier: existingByProvider.tier,
      isNew: false,
    };
  }

  // 2. Check if user exists by email (link accounts)
  const existingByEmail = await prisma.user.findUnique({
    where: { email: profile.email },
  });
  if (existingByEmail) {
    // Link the OAuth provider to the existing account
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        [providerField]: profile.providerId,
        avatarUrl: profile.avatarUrl ?? existingByEmail.avatarUrl,
        displayName: profile.name ?? existingByEmail.displayName,
      },
    });
    return {
      id: existingByEmail.id,
      email: existingByEmail.email,
      tier: existingByEmail.tier,
      isNew: false,
    };
  }

  // 3. Create new user
  const newUser = await prisma.user.create({
    data: {
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
      [providerField]: profile.providerId,
    },
  });

  log.info(`New OAuth user created: ${profile.email} via ${profile.provider}`);
  return { id: newUser.id, email: newUser.email, tier: newUser.tier, isNew: true };
}

// ── Full OAuth Flow ─────────────────────────────────────────────────────────

export async function handleOAuthCallback(
  provider: string,
  code: string,
  redirectUri: string,
): Promise<OAuthProfile | null> {
  // Exchange code for access token
  const accessToken = await exchangeCodeForToken(provider, code, redirectUri);
  if (!accessToken) {
    log.error(`Failed to exchange code for ${provider}`);
    return null;
  }

  // Fetch user profile
  const profile = await fetchProfile(provider, accessToken);
  if (!profile) {
    log.error(`Failed to fetch profile for ${provider}`);
    return null;
  }

  return profile;
}

// ── Check if provider is configured ─────────────────────────────────────────

export function isProviderConfigured(provider: string): boolean {
  return getProviderConfig(provider) !== null;
}
