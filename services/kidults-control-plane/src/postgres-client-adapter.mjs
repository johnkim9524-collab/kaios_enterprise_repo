import pg from 'pg';

const ROLE = 'kidults_control_projector';

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name}_REQUIRED`);
  return value.trim();
}

export async function openGovernedProjectorClient({
  connectionString,
  Client = pg.Client,
}) {
  const dsn = required(connectionString, 'POSTGRES_DSN');
  if (!/^postgres(?:ql)?:\/\//i.test(dsn)) throw new Error('POSTGRES_DSN_INVALID');
  const client = new Client({ connectionString: dsn });
  await client.connect();
  try {
    await client.query(`SET ROLE ${ROLE}`);
    const identity = await client.query('SELECT current_user AS current_user');
    if (identity.rows?.[0]?.current_user !== ROLE) throw new Error('POSTGRES_PROJECTOR_ROLE_NOT_ACTIVE');
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

export const postgresProjectorRuntimeContract = Object.freeze({
  databaseRole: ROLE,
  secretsInArgv: false,
});