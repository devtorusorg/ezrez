import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://tiagobnobrega.github.io",
  base: "/ezrez",
  integrations: [
    starlight({
      title: "ezrez",
      description: "Small, data-only TypeScript results with exhaustive failure handling.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/devtorusorg/ezrez",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Getting started", slug: "getting-started" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Results and guards", slug: "results" },
            { label: "Matching and recovery", slug: "matching-and-recovery" },
            { label: "Error snapshots", slug: "error-snapshots" },
          ],
        },
      ],
    }),
  ],
});
