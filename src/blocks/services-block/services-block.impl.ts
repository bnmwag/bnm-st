type Selection = {
    title: string;
    min: number;
    max: number;
    basis?: string;
};

const read = (button: HTMLButtonElement): Selection => ({
    title: button.dataset.service ?? "",
    min: Number(button.dataset.min ?? 0),
    max: Number(button.dataset.max ?? 0),
    basis: button.dataset.basis,
});

/** Lets a visitor assemble a scope, and adds up what it would take. */
export const mount = (el: HTMLElement) => {
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-service]"));
    const scopeEl = el.querySelector<HTMLElement>("[data-services-scope]");
    const estimateEl = el.querySelector<HTMLElement>("[data-services-estimate]");
    const briefEl = el.querySelector<HTMLAnchorElement>("[data-services-brief]");
    if (!scopeEl || !estimateEl) return;

    const update = () => {
        const picked = buttons
            .filter((button) => button.getAttribute("aria-pressed") === "true")
            .map(read);

        if (briefEl) {
            const scope = picked.map((item) => item.title).join(",");
            briefEl.href = scope ? `/contact?scope=${encodeURIComponent(scope)}` : "/contact";
        }

        if (picked.length === 0) {
            scopeEl.textContent = "Nothing picked yet";
            estimateEl.textContent = "—";
            return;
        }

        scopeEl.textContent = picked.map((item) => item.title).join(" + ");

        const min = picked.reduce((total, item) => total + item.min, 0);
        const max = picked.reduce((total, item) => total + item.max, 0);
        const bases = picked.map((item) => item.basis).filter(Boolean);

        const weeks = max > 0 ? `${min} — ${max} weeks` : "";
        estimateEl.textContent = [weeks, ...bases].filter(Boolean).join(" + ");
    };

    const onClick = (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const pressed = button.getAttribute("aria-pressed") === "true";
        button.setAttribute("aria-pressed", pressed ? "false" : "true");
        update();
    };

    for (const button of buttons) button.addEventListener("click", onClick);
    update();

    return () => {
        for (const button of buttons) button.removeEventListener("click", onClick);
    };
};
