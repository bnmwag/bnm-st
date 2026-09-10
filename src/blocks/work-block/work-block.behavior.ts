import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "work-block",
    selector: "[data-work-block]",
    lazy: () => import("./work-block.impl"),
});
