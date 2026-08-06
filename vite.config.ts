import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    rollupOptions: {
      // Externalize chromium binaries from the client build.
      external: ["@sparticuz/chromium", "puppeteer-core"],
    },
  },
  // Force all FullCalendar packages to be pre-bundled together.
  // Without this Vite processes each @fullcalendar package in isolation,
  // which breaks class inheritance (DayTableView "cannot be invoked without new").
  optimizeDeps: {
    include: [
      "@fullcalendar/core",
      "@fullcalendar/react",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/interaction",
    ],
  },
  ssr: {
    // Also prevent SSR from externalising these packages
    noExternal: [
      "@fullcalendar/core",
      "@fullcalendar/react",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/interaction",
    ],
  },
});


