// Configure PDF.js worker
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


      /**
       * Render a PDF document directly into the webpage.
       *
       * @param {string} file       PDF filename
       * @param {string} containerId Target HTML element
       */
      async function renderPDF(file, containerId) {
        const container = document.getElementById(containerId);

        if (!container) return;

        try {
          container.innerHTML =
            '<p class="pdf-loading">Indlæser dokument...</p>';

          // Load PDF
          const pdf = await pdfjsLib.getDocument(file).promise;

          container.innerHTML = "";

          // Render each page
          for (
            let pageNumber = 1;
            pageNumber <= pdf.numPages;
            pageNumber++
          ) {
            const page = await pdf.getPage(pageNumber);

            // Calculate scale based on available width
            const baseViewport = page.getViewport({ scale: 1 });

            const containerWidth = container.clientWidth - 10;

            const scale = containerWidth / baseViewport.width;

            const viewport = page.getViewport({ scale });

            // Create canvas
            const canvas = document.createElement("canvas");

            const context = canvas.getContext("2d");

            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);

            canvas.className = "pdf-page";

            container.appendChild(canvas);

            // Render page
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
          }

        } catch (error) {
          console.error("PDF rendering error:", file, error);

          container.innerHTML = `
            <div class="pdf-error">
              <p>Dokumentet kunne ikke indlæses. Prøv igen senere.</p>
            </div>
          `;
        }
      }


      // Load both documents when the page is ready
      document.addEventListener("DOMContentLoaded", () => {
        renderPDF("/Husorden.pdf", "husorden-pdf");
        renderPDF("/Vedtægter.pdf", "vedtaegter-pdf");
      });
