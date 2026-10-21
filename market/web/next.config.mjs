import path from 'node:path';
/** The fantasy league engine lives in ../game (plain Node, shared with the CLI jobs), so allow imports from outside web/. */
export default {
  experimental: { externalDir: true },
  env: { GAME_DATA_DIR: process.env.GAME_DATA_DIR || path.resolve(process.cwd(), '..', 'game', 'data') },
};
