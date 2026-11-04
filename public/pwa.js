if ("serviceWorker" in navigator && window.isSecureContext) {
  const wasControlledOnLoad = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!wasControlledOnLoad || reloadingForUpdate) return;

    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", {
        updateViaCache: "none"
      })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn("SGHNMS PWA: Service Worker konnte nicht registriert werden.", error);
      });
  });
}
