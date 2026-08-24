import { fleetSurfaceHref, injectWatchUrls, projectFromFleetRoute } from "@/lib/fleet-context";

const project = "BiasLens alpha";
if (fleetSurfaceHref("profile", project) !== "/projects?project=BiasLens%20alpha") {
  throw new Error("profile deep link");
}
if (fleetSurfaceHref("chat", project) !== "/loki?project=BiasLens%20alpha") {
  throw new Error("chat deep link");
}
if (fleetSurfaceHref("control", project) !== "/control?focus=BiasLens%20alpha") {
  throw new Error("control deep link");
}
if (fleetSurfaceHref("terminal", project) !== "/terminal?source=server&tab=BiasLens%20alpha") {
  throw new Error("terminal deep link");
}
if (fleetSurfaceHref("activity", project) !== "/activity?project=BiasLens%20alpha") {
  throw new Error("activity deep link");
}
if (projectFromFleetRoute("/terminal", new URLSearchParams("source=server&tab=BiasLens")) !== "BiasLens") {
  throw new Error("terminal route context");
}
if (projectFromFleetRoute("/projects", new URLSearchParams("project=BiasLens+alpha")) !== project) {
  throw new Error("profile route context");
}
if (projectFromFleetRoute("/activity", new URLSearchParams("project=BiasLens+alpha")) !== project) {
  throw new Error("activity route context");
}
if (projectFromFleetRoute("/projects", new URLSearchParams("open=123")) !== null) {
  throw new Error("catalog must not masquerade as workspace context");
}

const watch = injectWatchUrls(project);
if (watch.watchUrl !== "/control?focus=BiasLens%20alpha") {
  throw new Error("inject watchUrl is Control");
}
if (watch.activityUrl !== "/activity?project=BiasLens%20alpha") {
  throw new Error("inject activityUrl");
}
if (watch.terminalUrl !== "/terminal?source=server&tab=BiasLens%20alpha") {
  throw new Error("inject terminalUrl");
}

console.log("✓ fleet-context tests passed");
