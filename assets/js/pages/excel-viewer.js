(async function () {
        const viewer = document.getElementById("excel-viewer");

        try {
          const response = await fetch(
            "/Venteliste%20Parkering.xlsx"
          );

          if (!response.ok) {
            throw new Error(
              "Excel-filen kunne ikke hentes. HTTP-status: " +
                response.status
            );
          }

          const workbook = XLSX.read(
            await response.arrayBuffer(),
            { type: "array" }
          );

          const worksheet =
            workbook.Sheets[workbook.SheetNames[0]];

          if (!worksheet || !worksheet["!ref"]) {
            throw new Error("Regnearket er tomt.");
          }

          // Limit the displayed range to columns A, B and C.
          const originalRange = XLSX.utils.decode_range(
            worksheet["!ref"]
          );

          const range = {
            s: { r: originalRange.s.r, c: 0 },
            e: {
              r: originalRange.e.r,
              c: Math.min(originalRange.e.c, 2)
            }
          };

          // Create a new worksheet containing only the first three columns.
          const filteredSheet = {};

          for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = 0; col <= range.e.c; col++) {
              const address = XLSX.utils.encode_cell({
                r: row,
                c: col
              });

              if (worksheet[address]) {
                filteredSheet[address] = {
                  ...worksheet[address]
                };
              }
            }
          }

          filteredSheet["!ref"] =
            XLSX.utils.encode_range(range);

          // Preserve merged cells only when they fall entirely
          // within columns A–C.
          if (worksheet["!merges"]) {
            filteredSheet["!merges"] =
              worksheet["!merges"].filter(merge =>
                merge.s.c >= 0 &&
                merge.e.c <= 2
              );
          }

          // Render the filtered worksheet as HTML.
          viewer.innerHTML = XLSX.utils.sheet_to_html(
            filteredSheet,
            { id: "venteliste-excel" }
          );

          const table = viewer.querySelector("table");

          if (table) {
            table.setAttribute(
              "aria-label",
              "Venteliste til parkering"
            );
          }
        } catch (error) {
          console.error(
            "Fejl ved indlæsning af ventelisten:",
            error
          );

          viewer.textContent =
            "Ventelisten kunne ikke indlæses. Prøv igen senere.";
        }
      })();
