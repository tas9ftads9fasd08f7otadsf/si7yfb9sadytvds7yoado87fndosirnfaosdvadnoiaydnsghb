/** 171 A trimmed coffee-trip answer, which nests its lists three ways; the app's tests read the same one. */
export const COFFEE_TRIP = {
  trip: { name: "Coffee trip", year: 2026, open: true },
  cafes: [
    { id: 1, name: "Espresso Embassy", latLng: "47.49, 19.05", city: { id: 3, name: "Budapest" }, tags: ["roaster", "wifi"],
      owner: { contact: { email: "hi@embassy.test" } }, note: "" },
    { id: 2, name: "Café Nové", latLng: "48.14, 17.10", city: { id: 4, name: "Bratislava" }, tags: ["wifi"],
      owner: { contact: { email: "" } }, note: "closed on Sundays" },
    { id: 3, name: "Kávovar", latLng: "48.71, 21.26", city: { id: 5, name: "Košice" }, tags: [], extra: "only here" }
  ],
  cities: [{ id: 3, name: "Budapest", lat: 47.49, lon: 19.04 }, { id: 4, name: "Bratislava", lat: 48.14, lon: 17.1 }],
  giveaways: [],
  grid: [[1, 2], [3, 4]],
  nothing: null
};
