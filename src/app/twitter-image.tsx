import { APP_DESCRIPTION } from "@/config/brand";
import OGImage from "./opengraph-image";

// Twitter card uses the same generated PNG as OpenGraph. Next.js doesn't allow
// re-exporting the route-segment config object, so each constant is declared
// inline here even though they mirror opengraph-image.tsx exactly.

export const runtime = "edge";
export const alt = APP_DESCRIPTION;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default OGImage;
