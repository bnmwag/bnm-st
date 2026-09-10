import { defineBehavior } from "@/scripts/core";

import "./services-block.css";

defineBehavior({
    name: "services-block",
    selector: "[data-services-block]",
    lazy: () => import("./services-block.impl"),
});
