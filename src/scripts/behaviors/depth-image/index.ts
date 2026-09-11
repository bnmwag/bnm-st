import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "depth-image",
    selector: "[data-depth-image]",
    lazy: () => import("./depth-image.impl"),
});
