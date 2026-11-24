export type Identity = {
  email: string;
  admin: boolean;
  local: boolean;
  provider?: string | undefined;
};

export interface LcsBindings {
  ASSETS: Fetcher;
  VAULT: DurableObjectNamespace;
  LCS_LOGIN_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  ACCESS_TEAM?: string;
  ACCESS_AUDIENCE?: string;
  LCS_TEAM_EMAILS?: string;
  VAULT_ADMIN_EMAILS?: string;
  LCS_SESSION_KEY?: string;
  LCS_TEAM_KEYS?: string;
  LCS_LOCAL_DEV?: string;
}
