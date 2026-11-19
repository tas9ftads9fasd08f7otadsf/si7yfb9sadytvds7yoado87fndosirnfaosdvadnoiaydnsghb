import type { Backend } from "@/backend/types";

const notYet = () => Promise.reject(new Error("The site's backend comes with step 3 of web-icloud.md"));

/** iCloud through CloudKit JS and the core; every call refuses until step 3 builds it. */
export const backend: Backend = {
  target: "web",
  words: notYet, session: notYet, askToJoin: notYet, unlock: notYet, useToken: () => {},
  maps: notYet, map: notYet, style: notYet, change: notYet, newMap: notYet, importMap: notYet, exportMap: notYet,
  duplicateMap: notYet, deleteMap: notYet, shelve: notYet, switches: notYet, people: notYet, askPeople: notYet,
  setPicture: notYet, layerOptions: notYet, testLayer: notYet, roadSigns: notYet, iconURL: () => "", packages: notYet, servers: notYet, addServer: notYet,
  importServers: notYet, exportServers: notYet, addServerLayers: notYet, readAPI: notYet, addAPI: notYet,
  addFile: notYet, readDXF: notYet, readAddress: notYet, esriServices: notYet, changeEsriService: notYet, addTiles: notYet, addServiceLayers: notYet, coverage: notYet,
  coveragePlaces: notYet, startPlaces: notYet, regions: notYet, downloadRegion: notYet, offlinePlan: notYet,
  offlineDownload: notYet, discardStored: notYet, live: notYet,
  identify: notYet, details: notYet, phoneLocation: notYet, icon: notYet,
  symbolURL: () => "none"
};
