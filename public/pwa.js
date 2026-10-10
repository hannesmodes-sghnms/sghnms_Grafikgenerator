// PWA assets v1
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error) => {
        console.warn("SGHNMS PWA: Service Worker konnte nicht registriert werden.", error);
      });
  });
}
