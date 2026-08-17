// localStorage keys holding third-party provider API keys.
// Lives in its own tiny module so both providers.js and ledger.js can import
// it without creating an import cycle (providers.js already imports ledger.js).
export const PROVIDER_KEY_STORAGE = {
    runware: "provider_key_runware",
    fal: "provider_key_fal",
};
