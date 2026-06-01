# Wasalny

Cairo Minibus Finder is a lightweight static web app for searching Cairo minibus lines, stations, and route details. It uses browser IndexedDB to store seed route data and user-added lines, with built-in route mapping via Leaflet.

## Features

- Search bus lines by number, station, or from/to stops
- View route stop locations on an interactive map
- Detect nearby lines based on user location
- Add, edit, and manage local route entries in the browser
- Export/import route data as JSON
- Automatically loads seed data from `src/data.json`
- Light/dark theme toggle and user-friendly interface

## Project structure

- `index.html` — main application page
- `src/app.js` — application logic and IndexedDB data management
- `src/style.css` — UI styles and theme support
- `src/data.json` — seed route data used by the app
- `LICENSE` — project license

## Setup and usage

1. Open `index.html` in a browser.
2. Search by bus number, station, or from/to stops.
3. Click a route card to show it on the map.
4. Use the settings modal to add or edit custom lines.
5. Export or import route data from the Data tab.

## Notes

- Seed data reloads automatically on every visit, but user-added lines remain in browser storage.
- The app uses Leaflet for maps and OpenStreetMap tiles for route display.
- For a production deployment, host the project as a simple static website.
