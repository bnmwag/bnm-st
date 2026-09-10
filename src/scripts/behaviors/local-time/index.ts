import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "local-time",
    selector: "[data-local-time]",
    lazy: () => import("./local-time.impl"),
});
