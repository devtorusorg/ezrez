import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://devtorus.github.io",
  base: "/ezrez",
  integrations: [
    starlight({
      title: "ezrez",
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Getting started", slug: "getting-started" },
          ],
        },
      ],
    }),
  ],
});
