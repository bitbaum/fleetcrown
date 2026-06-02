// Brand-prefixed env-var resolver. Reads APP_<KEY> first, then FLEETCROWN_<KEY>
// (current slug), then COCKPIT_<KEY> (legacy) for transition. Lets the app
// rename its brand prefix without breaking machines that already export old
// COCKPIT_*-prefixed variables.
//
// Mirror of scripts/_brand.sh:_brand_env so shell + TS resolve identically.
export function envAlias(key: string, fallback = ""): string {
  return (
    process.env[`APP_${key}`] ??
    process.env[`FLEETCROWN_${key}`] ??
    process.env[`COCKPIT_${key}`] ??
    fallback
  );
}

// Boolean form — "1" means true, anything else is false.
export function envAliasBool(key: string): boolean {
  return envAlias(key) === "1";
}
