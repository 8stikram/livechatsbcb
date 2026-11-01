// Set online with `wrangler secret put`, so they appear in no file. The tests pass stand-ins for them.
interface Env {
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
}
