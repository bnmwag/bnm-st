import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "hero-sigil",
    selector: "[data-hero-sigil]",
    lazy: () => import("./hero-block.impl"),
});
