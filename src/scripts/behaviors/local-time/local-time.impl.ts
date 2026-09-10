const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

export const mount = (el: HTMLElement) => {
    const tick = () => {
        el.textContent = clock.format(new Date());
    };

    tick();
    const interval = window.setInterval(tick, 1000);

    return () => window.clearInterval(interval);
};
