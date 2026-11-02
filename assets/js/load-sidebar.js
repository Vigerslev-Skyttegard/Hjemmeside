(() => {
  const sidebar = document.getElementById("sidebar");

  if (!sidebar) {
    console.error('Menuen kan ikke indlæses: elementet "#sidebar" mangler.');
    return;
  }

  const loadMainScript = () => {
    const script = document.createElement("script");
    script.src = new URL("/assets/js/main.js", document.baseURI).href;
    script.onerror = () => {
      console.error("Menuen blev indlæst, men sidens funktioner kunne ikke startes.");
    };
    document.body.appendChild(script);
  };

  fetch(new URL("/partials/sidebar.html", document.baseURI))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.text();
    })
    .then((html) => {
      sidebar.innerHTML = html;

      const getPageKey = (pathname) => {
        const segments = pathname.split("/").filter(Boolean);
        return segments.length ? segments[segments.length - 1] : "index";
      };

      const currentPage = getPageKey(window.location.pathname);

      sidebar.querySelectorAll("a[href]").forEach((link) => {
        const linkedPage = getPageKey(new URL(link.href).pathname);

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
