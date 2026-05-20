import ProfileOGImage from "./opengraph-image";
import { APP_NAME } from "@/config/brand";

// Twitter card uses the same generated PNG as OpenGraph. Route-segment config
// must be declared in each file (Next.js rejects re-exports).
export const alt = `Builder profile on ${APP_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default ProfileOGImage;
