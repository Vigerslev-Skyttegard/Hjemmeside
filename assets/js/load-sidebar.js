(() => {
  const sidebar = document.getElementById("sidebar");

  if (!sidebar) {
    console.error('Menuen kan ikke indlæses: elementet "#sidebar" mangler.');
    return;
  }

  const loadMainScript = () => {
    const script = document.createElement("script");
    script.src = new URL("assets/js/main.js", document.baseURI).href;
    script.onerror = () => {
      console.error("Menuen blev indlæst, men sidens funktioner kunne ikke startes.");
    };
    document.body.appendChild(script);
  };

<<<<<<< Updated upstream
  fetch(new URL("sidebar.html", document.baseURI))
=======
  fetch(new URL("/partials/sidebar.html", document.baseURI))
>>>>>>> Stashed changes
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.text();
    })
    .then((html) => {
      sidebar.innerHTML = html;

      const currentPage =
        window.location.pathname.split("/").pop() || "index.html";

      sidebar.querySelectorAll("a[href]").forEach((link) => {
        const linkedPage = new URL(link.href).pathname.split("/").pop();

        if (linkedPage === currentPage) {
          link.setAttribute("aria-current", "page");
        }
      });

      loadMainScript();
    })
    .catch((error) => {
      console.error("Menuen kunne ikke indlæses:", error);
    });
})();
