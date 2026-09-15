/**
 * zambianLocations.js
 * Supported Zambian Cities and Towns dataset for Admin Assist SIS.
 * Maintainable dataset used across enrollment, profiles, and backend validation.
 */
"use strict";

const ZAMBIAN_CITIES = [
    "Lusaka",
    "Kitwe",
    "Ndola",
    "Kabwe",
    "Chingola",
    "Mufulira",
    "Luanshya",
    "Livingstone",
    "Kasama",
    "Chipata",
    "Solwezi",
    "Mansa",
    "Mongu",
    "Choma",
    "Mazabuka",
    "Kafue",
    "Kalulushi",
    "Monze",
    "Kapiri Mposhi",
    "Mpika",
    "Chililabombwe",
    "Petauke",
    "Mumbwa",
    "Nchelenge",
    "Samfya",
    "Kawambwa",
    "Sesheke",
    "Senanga",
    "Kaoma",
    "Lundazi",
    "Serenje"
];

/**
 * Checks whether a given city string is in the supported dataset.
 */
const isValidZambianCity = (city) => {
    if (!city || typeof city !== "string") return false;
    const trimmed = city.trim();
    return ZAMBIAN_CITIES.some(c => c.toLowerCase() === trimmed.toLowerCase());
};

/**
 * Normalizes city to canonical case.
 */
const normalizeZambianCity = (city) => {
    if (!city || typeof city !== "string") return null;
    const trimmed = city.trim();
    const match = ZAMBIAN_CITIES.find(c => c.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};

module.exports = {
    ZAMBIAN_CITIES,
    isValidZambianCity,
    normalizeZambianCity
};
