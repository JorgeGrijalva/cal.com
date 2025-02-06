// vite.config.ts
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import path from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
  esbuild: {
    target: "node18",
    platform: "node",
  },
  build: {
    target: "node18",
    platform: "node",
    ssr: true,
    lib: {
      entry: resolve(__dirname, "./index.ts"),
      name: "calcom-lib",
      fileName: "calcom-lib",
    },
    commonjsOptions: {
      dynamicRequireRoot: "../../../apps/web",
      dynamicRequireTargets: ["next-i18next.config.js"],
      ignoreDynamicRequires: true,
    },
    rollupOptions: {
      external: [
        "react",
        "fs",
        "path",
        "os",
        "crypto",
        "react-dom",
        "http",
        "fs/promises",
        "perf_hooks",
        "@prisma/client",
        "async",
        "libphonenumber-js",
        "lodash",
        "short-uuid",
        "uuid",
        "zod",
        "dayjs",
        "i18next",
        "next-i18next",
        "@sentry/nextjs",
        "raw-body",
        "@getalby/lightning-tools",
        "svix",
        "ical.js",
        "ics",
        "tsdav",
        "@googleapis/calendar",
        "rrule",
        "@hubspot/api-client",
        "querystring",
        "handlebars",
        "@sendgrid/client",
        "@sendgrid/mail",
        "twilio",
        "@prisma/client/runtime/index-browser.js",
        "lru-cache",
        "next-auth/jwt",
        "memory-cache",
        "@jsforce/jsforce-node",
        "jsforce",
        "axios",
        "qs",
        "qs-stringify",
        "stripe",
        "@tryvital/vital-node",
        "queue",
        "entities",
        "nodemailer",
        "react/jsx-runtime",
        "sanitize-html",
        "markdown-it",
        "react-i18next",
        "jsonwebtoken",
        "ews-javascript-api",
        "dayjs/plugin/customParseFormat.js",
        "dayjs/plugin/duration.js",
        "dayjs/plugin/isBetween.js",
        "dayjs/plugin/isToday.js",
        "dayjs/plugin/localizedFormat.js",
        "dayjs/plugin/minMax.js",
        "dayjs/plugin/relativeTime.js",
        "dayjs/plugin/timezone.js",
        "dayjs/plugin/toArray.js",
        "dayjs/plugin/utc.js",
        "tslog",
        "@prisma/extension-accelerate",
        "@ewsjs/xhr",
        "next-i18next/serverSideTranslations",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          fs: "fs",
          path: "path",
          os: "os",
          crypto: "crypto",
          http: "http",
          "fs/promises": "fs/promises",
          perf_hooks: "perf_hooks",
          "@prisma/client": "@prisma/client",
          async: "async",
          "libphonenumber-js": "libphonenumber-js",
          lodash: "lodash",
          "short-uuid": "short-uuid",
          uuid: "uuid",
          zod: "zod",
          dayjs: "dayjs",
          i18next: "i18next",
          "next-i18next": "next-i18next",
          "@sentry/nextjs": "@sentry/nextjs",
          "raw-body": "raw-body",
          "@getalby/lightning-tools": "@getalby/lightning-tools",
          svix: "svix",
          "ical.js": "ical.js",
          ics: "ics",
          tsdav: "tsdav",
          "@googleapis/calendar": "@googleapis/calendar",
          rrule: "rrule",
          "@hubspot/api-client": "@hubspot/api-client",
          querystring: "querystring",
          handlebars: "handlebars",
          "@sendgrid/client": "@sendgrid/client",
          "@sendgrid/mail": "@sendgrid/mail",
          twilio: "twilio",
          "@prisma/client/runtime/index-browser.js": "@prisma/client/runtime/index-browser.js",
          "lru-cache": "lru-cache",
          "next-auth/jwt": "next-auth/jwt",
          "memory-cache": "memory-cache",
          "@jsforce-node": "@jsforce/jsforce-node",
          jsforce: "jsforce",
          axios: "axios",
          qs: "qs",
          "qs-stringify": "qs-stringify",
          stripe: "stripe",
          "@tryvital/vital-node": "@tryvital/vital-node",
          queue: "queue",
          entities: "entities",
          nodemailer: "nodemailer",
          "react/jsx-runtime": "react/jsx-runtime",
          "sanitize-html": "sanitize-html",
          "markdown-it": "markdown-it",
          "react-i18next": "react-i18next",
          jsonwebtoken: "jsonwebtoken",
          "ews-javascript-api": "ews-javascript-api",
          "dayjs/plugin/customParseFormat.js": "dayjs/plugin/customParseFormat.js",
          "dayjs/plugin/duration.js": "dayjs/plugin/duration.js",
          "dayjs/plugin/isBetween.js": "dayjs/plugin/isBetween.js",
          "dayjs/plugin/isToday.js": "dayjs/plugin/isToday.js",
          "dayjs/plugin/localizedFormat.js": "dayjs/plugin/localizedFormat.js",
          "dayjs/plugin/minMax.js": "dayjs/plugin/minMax.js",
          "dayjs/plugin/relativeTime.js": "dayjs/plugin/relativeTime.js",
          "dayjs/plugin/timezone.js": "dayjs/plugin/timezone.js",
          "dayjs/plugin/toArray.js": "dayjs/plugin/toArray.js",
          "dayjs/plugin/utc.js": "dayjs/plugin/utc.js",
          tslog: "tslog",
          "@prisma/extension-accelerate": "@prisma/extension-accelerate",
          "@ewsjs/xhr": "@ewsjs/xhr",
          "next-i18next/serverSideTranslations": "next-i18next/serverSideTranslations",
          "@calcom/prisma/client": "@calcom/prisma/client",
        },
      },
    },
  },
  plugins: [react(), dts()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@calcom/lib": path.resolve(__dirname, "../../lib"),
      "@calcom/trpc": resolve("../../trpc"),
      "lru-cache": resolve("../../../node_modules/lru-cache/dist/cjs/index.js"),
      "@prisma/client": resolve("../../../node_modules/@prisma/client"),
      "@calcom/prisma/client": resolve("../../../node_modules/.prisma/client"),
      "@calcom/platform-constants": path.resolve(__dirname, "../constants/index.ts"),
      "@calcom/platform-types": path.resolve(__dirname, "../types/index.ts"),
      "@calcom/platform-utils": path.resolve(__dirname, "../constants/index.ts"),
    },
  },
});
