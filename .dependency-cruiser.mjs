// dependency-cruiser only reads JavaScript configuration files.
const SLICE = "^web/src/slices/([^/]+)/";

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-is-independent",
      comment: "shared cannot depend on slices or on the app shell.",
      severity: "error",
      from: { path: "^web/src/shared/" },
      to: { path: "^web/src/(slices|app)/" },
    },
    {
      name: "slices-do-not-depend-on-the-app",
      severity: "error",
      from: { path: "^web/src/slices/" },
      to: { path: "^web/src/app/" },
    },
    {
      name: "slices-expose-only-their-index",
      comment: "Another slice can only be imported through its index.ts.",
      severity: "error",
      from: { path: SLICE },
      to: {
        path: "^web/src/slices/[^/]+/",
        pathNot: ["^web/src/slices/$1/", "^web/src/slices/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "the-app-uses-only-slice-indexes",
      severity: "error",
      from: { path: "^web/src/app/" },
      to: {
        path: "^web/src/slices/[^/]+/",
        pathNot: "^web/src/slices/[^/]+/index\\.ts$",
      },
    },
    {
      name: "tooling-stays-out-of-the-app",
      severity: "error",
      from: { path: "^web/src/" },
      to: { path: "^(scripts|tests)/" },
    },
    {
      name: "specs-do-not-know-the-screens",
      comment:
        "A spec talks to the AppDriver interface: only the driver knows how the app is built.",
      severity: "error",
      from: { path: "^tests/e2e/specs/" },
      to: { path: "^tests/e2e/support/driver/react/" },
    },
  ],
  options: {
    // dependency-cruiser cannot read TypeScript 7 yet, so it parses through swc.
    parser: "swc",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.app.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js"],
    },
    doNotFollow: { path: "node_modules" },
  },
};
