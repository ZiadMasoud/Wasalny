# 🚌 Wasalny

> Cairo Minibus Finder - Your guide to Cairo's minibus network

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-View%20Now-blue?style=for-the-badge)](https://ziadmasoud.github.io/Wasalny/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](/LICENSE)

A lightweight, fast static web app for searching Cairo minibus lines, stations, and route details. Find your route in seconds with an intuitive interface and interactive maps.

---

## ✨ Features

- 🔍 **Smart Search** - Find bus lines by number, station, or from/to stops
- 🗺️ **Interactive Maps** - View route stop locations on an interactive map powered by Leaflet
- 📍 **Location Detection** - Detect nearby lines based on your current location
- ➕ **Manage Routes** - Add, edit, and manage local route entries directly in your browser
- 💾 **Data Control** - Export/import route data as JSON for backup or sharing
- ⚡ **Offline Ready** - Automatically loads seed data from `src/data.json` and persists user data
- 🎨 **Theme Support** - Light/dark theme toggle with user-friendly interface

---

## 🚀 Quick Start

### Option 1: Use Online Demo
Just visit the [live demo](https://ziadmasoud.github.io/Wasalny/) to start searching for Cairo minibus routes immediately!

### Option 2: Local Setup
1. Clone the repository
   ```bash
   git clone https://github.com/ZiadMasoud/Wasalny.git
   cd Wasalny
   ```
2. Open `index.html` in your browser
3. Start searching and exploring routes!

---

## 📖 How to Use

1. **Search Routes** - Use the search bar to find buses by number, station, or route
2. **View on Map** - Click a route card to display it on the interactive map
3. **Detect Nearby** - Enable location services to find minibuses near you
4. **Manage Custom Routes** - Open settings to add or edit your own route entries
5. **Backup Data** - Export your custom routes from the Data tab

---

## 🏗️ Project Structure

```
Wasalny/
├── index.html          # Main application page
├── src/
│   ├── app.js         # Application logic & IndexedDB management
│   ├── style.css      # UI styles with theme support
│   └── data.json      # Seed route data
├── LICENSE            # Project license
└── README.md          # This file
```

---

## 📝 Notes

- ✅ **Persistent Storage** - Seed data reloads automatically, but your custom routes stay saved in browser storage
- 🗺️ **Map Technology** - Uses [Leaflet](https://leafletjs.com/) with [OpenStreetMap](https://www.openstreetmap.org/) tiles
- 🌐 **Deployment** - Perfect for hosting as a static website on GitHub Pages, Vercel, or any static host
- 📱 **Responsive Design** - Works great on desktop and mobile devices

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript
- **Storage**: IndexedDB (Browser native database)
- **Maps**: Leaflet + OpenStreetMap
- **Styling**: CSS3 with theme support

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](/LICENSE) file for details.

---

## 💬 Feedback & Contributions

Found a bug? Have a suggestion? Feel free to open an issue or contribute to the project!

**[View Live Demo ➜](https://ziadmasoud.github.io/Wasalny/)**
