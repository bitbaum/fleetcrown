import EssayOGImage from "./opengraph-image";
import { APP_NAME } from "@/config/brand";

// Twitter card reuses the per-essay OG PNG. Route-segment config must be
// declared inline in each file (Next.js rejects re-exports of these consts).
export const alt = `Essay on ${APP_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default EssayOGImage;
