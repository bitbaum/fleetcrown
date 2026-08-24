/** The list-page project shape — entity row + attrs + runtime meta. Lived in
 *  ProjectGridCard.tsx until the card/row split was unified into ProjectRow;
 *  the type outlived both components. */
export type ProjectGridRow = {
  id: string;
  name: string;
  description: string | null;
  gitUrl?: string | null;
  attrs: Record<string, string>;
  readonly?: boolean;
  dirPath?: string | null;
  agentPref?: string | null;
  userProjectId?: string | null;
  liveUrl?: string | null;
  /** Latest probe. null = never checked or no site. */
  siteOk?: boolean | null;
};
