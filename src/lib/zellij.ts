import { execSync } from "child_process";

export function injectIntoTab(tab: string, prompt: string): void {
  const escaped = prompt.replace(/'/g, `'"'"'`);
  execSync(`zellij action go-to-tab-name '${tab}'`);
  execSync("sleep 0.3");
  execSync(`zellij action write-chars '${escaped}'`);
  execSync("sleep 0.1");
  execSync("zellij action write 13");
}
