async function renderDocx(fileUrl) {
        const container = document.getElementById("docx-container");

        try {
          container.innerHTML = "<p>Indlæser nyhedsbrev...</p>";

          // Verify dependencies
          if (typeof JSZip === "undefined") {
            throw new Error("JSZip kunne ikke indlæses.");
          }

          if (typeof docx === "undefined" || typeof docx.renderAsync !== "function") {
            throw new Error("DOCX-preview kunne ikke indlæses.");
          }

          // Fetch document
          const response = await fetch(fileUrl);

          if (!response.ok) {
            throw new Error(
              `Kunne ikke hente dokumentet. HTTP ${response.status}`
            );
          }

          const blob = await response.blob();

          if (blob.size === 0) {
            throw new Error("Dokumentet er tomt.");
          }

          // Clear loading message
          container.innerHTML = "";

          // Render Word document
          await docx.renderAsync(
            blob,
            container,
            container,
            {
              className: "docx",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              breakPages: true,
              ignoreFonts: false,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
              renderEndnotes: true
            }
          );

        } catch (error) {
          console.error("DOCX rendering error:", error);

          container.innerHTML = `
            <div class="docx-error">
              <p>Nyhedsbrevet kunne ikke indlæses. Prøv igen senere.</p>
            </div>
          `;
        }
      }

      // Load document when page is ready
      document.addEventListener("DOMContentLoaded", () => {
        renderDocx("/Nyhedsbrev.docx");
      });
