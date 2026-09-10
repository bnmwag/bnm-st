import { defineBehavior } from "@/scripts/core";

defineBehavior({
    name: "site-nav",
    selector: "[data-site-nav]",
    lazy: () => import("./site-nav.impl"),
});
