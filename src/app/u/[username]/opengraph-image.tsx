import { ImageResponse } from "next/og";
import { getUserByUsername } from "@/db/queries/users";
import { getPublicProjects } from "@/db/queries/user-projects";
import { getInitials } from "@/lib/initials";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";

// Per-profile OG image: takes the same `params` as the page and renders a
// personalized 1200×630 card with avatar/initials + display name + @handle +
// public project count. Reuses the same dark brand canvas as the root OG card.
//
// Node runtime (not edge) because the DB driver (postgres-js) is Node-only.

export const alt = `Builder profile on ${APP_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ProfileOGImage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await getUserByUsername(username);

  if (!user) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#a1a1aa",
            fontFamily: "sans-serif",
            fontSize: 48,
          }}
        >
          Profile not found
        </div>
      ),
      { ...size },
    );
  }

  const projects = await getPublicProjects(user.id);
  const displayName = user.name ?? username;
  const initials = getInitials(displayName);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#0a0a0a",
          color: "#ededed",
          padding: "80px",
          fontFamily: "sans-serif",
          gap: 56,
        }}
      >
        {/* Avatar — image or initials circle (160px) */}
        {user.image ? (
          <img
            src={user.image}
            alt={displayName}
            width={200}
            height={200}
            style={{ borderRadius: 100, flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
              background: "#1f2937",
              color: "#ededed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 88,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}

        {/* Identity block */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 36,
              color: "#a1a1aa",
              lineHeight: 1.1,
            }}
          >
            {`@${username}`}
          </div>
          <div
            style={{
              marginTop: 40,
              fontSize: 28,
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span>{`${projects.length} public project${projects.length === 1 ? "" : "s"}`}</span>
            <span style={{ color: "#52525b" }}>·</span>
            <span>{`${APP_NAME} · ${APP_TAGLINE}`}</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
