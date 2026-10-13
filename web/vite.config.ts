import { defineConfig } from "vite";

// two pages: the walkable forest (index.html) and the scroll tour (tour.html). treeview.html stays dev-only.
export default defineConfig({
  build: { rollupOptions: { input: { main: "index.html", tour: "tour.html" } } },
});
