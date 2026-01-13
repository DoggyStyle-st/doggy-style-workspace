/* Forwarder: js/app.js → /app.js */
(function () {
  console.log("Forwarder active: js/app.js → /app.js");

  const s = document.createElement("script");
  s.src = "../app.js?v=" + Date.now();
  s.async = false;
  s.defer = false;

  s.onerror = () => {
    console.error("Forwarder ERROR: ../app.js konnte nicht geladen werden");
  };

  document.head.appendChild(s);
})();