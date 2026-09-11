import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "smooth-sticky",
    selector: "[data-smooth-sticky]",
    lazy: () => import("./smooth-sticky.impl"),
});
