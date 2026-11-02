# Website structure

- `index.html` is the homepage.
- Each content page lives in its own directory as `index.html`, providing clean URLs such as `/parkering/`.
- The shared sidebar fragment lives in `partials/sidebar.html` and is loaded by `assets/js/load-sidebar.js`.
- Shared site assets remain in `assets/`. Page-specific viewer CSS and JavaScript live in `assets/css/pages/` and `assets/js/pages/`.
- PDF, DOCX and Excel files remain in the repository root so the existing sync workflows and document URLs continue to work.
