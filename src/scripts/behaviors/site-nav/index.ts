import { defineBehavior } from "@/scripts/core";

import "./site-nav.css";

defineBehavior({
    name: "site-nav",
    selector: "[data-site-nav]",
    lazy: () => import("./site-nav.impl"),
});
