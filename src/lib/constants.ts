import { homedir } from "os";

export const HOME = homedir();
export const OPENCLAW_DIR = `${HOME}/.openclaw`;
export const WORKSPACE_DIR = `${OPENCLAW_DIR}/workspace`;
export const TOOLS_DIR = `${WORKSPACE_DIR}/tools`;

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_USER_NAME = "George";
