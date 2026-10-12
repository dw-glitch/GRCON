const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const githubEnabled = env => env.GRCON_TEAMS_TRACEABILITY_ENABLED === 'true' && env.GRCON_TEAMS_TRANSPORT === 'github';
export function githubConfig(env) {
  const repository = env.GRCON_TEAMS_GITHUB_REPOSITORY;
  const repositoryId = String(env.GRCON_TEAMS_GITHUB_REPOSITORY_ID || '');
  const ownerId = String(env.GRCON_TEAMS_GITHUB_OWNER_ID || '');
  const tenant = env.GRCON_MICROSOFT_TENANT_ID;
  const conversation = env.GRCON_TEAMS_CONVERSATION_ID;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^\d+$/.test(repositoryId) || !/^\d+$/.test(ownerId) || !UUID.test(tenant || '') || !conversation || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw Object.assign(new Error('GITHUB_NOT_CONFIGURED'), {code:'GITHUB_NOT_CONFIGURED',status:503});
  return {repository,repositoryId,ownerId,tenant,conversation,audience:'grcon-teams-github',workflow:`${repository}/.github/workflows/relay.yml@refs/heads/main`};
}
