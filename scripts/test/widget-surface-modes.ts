import assert from "node:assert/strict";
import {
  defaultWidgetSurfaceMode,
  parseWidgetSurfaceModes,
  WIDGET_SURFACE_MODE_META,
} from "../../widget/surface-modes";

assert.equal(defaultWidgetSurfaceMode(), "report");
assert.deepEqual(parseWidgetSurfaceModes(null), ["report"]);
assert.deepEqual(parseWidgetSurfaceModes("report,chat,watch"), ["report", "chat", "watch"]);
assert.equal(WIDGET_SURFACE_MODE_META.report.shipped, true);
assert.equal(WIDGET_SURFACE_MODE_META.chat.shipped, false);
assert.equal(WIDGET_SURFACE_MODE_META.watch.shipped, false);
console.log("widget-surface-modes: ok");
