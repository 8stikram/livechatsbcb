// Set online with `wrangler secret put`, so it appears in no file. The tests pass a stand-in for it.
interface Env {
  DISCORD_CLIENT_SECRET: string;
}
