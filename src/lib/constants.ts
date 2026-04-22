import { homedir } from "os";
import path from "path";

export const HOME = homedir();
export const OPENCLAW_DIR = `${HOME}/.openclaw`;
export const WORKSPACE_DIR = `${OPENCLAW_DIR}/workspace`;
export const TOOLS_DIR = `${WORKSPACE_DIR}/tools`;
export const CRON_FILE = path.join(HOME, ".openclaw", "cron", "jobs.json");

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_USER_NAME = "George";
export const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
