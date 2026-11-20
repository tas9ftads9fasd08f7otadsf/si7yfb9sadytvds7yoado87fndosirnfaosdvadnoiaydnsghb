export const HEARTBEAT_EVERY = 5000;
export const RETRY_EVERY = 2000;
export const LIVE_EVERY = 60000;
/** 130 How often an open panel of a live layer reads the layer's answer again. */
export const PLACE_LIVE_EVERY = 15000;
export const PHONE_EVERY = 5000;
export const REGIONS_EVERY = 10000;
/** 92 How often the page asks whether the phone has said yes to its QR code. */
export const PAIR_EVERY = 2000;
export const TOKEN_KEY = "riki-edit-token";
export const THEME_KEY = "riki-theme";
export const DIRECT_KEY = "riki-tiles-direct";

/** A password, typed with any case or gaps, as the phone reads it. */
export const typedKey = (typed: string) => typed.toUpperCase().replace(/[^0-9A-Z]/g, "");
