import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "hero-gap",
    selector: "[data-hero-gap]",
    lazy: () => import("./hero-block.impl"),
});
