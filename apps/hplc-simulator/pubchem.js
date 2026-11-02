import { DEFAULT_COMPOUNDS } from "./compounds.js";

export { DEFAULT_COMPOUNDS };

const PUBCHEM_API = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const CURATED_CATEGORY_CIDS = [
    2244, 1983, 3672, 2519, 54670067, 9889182, 11005, 6817, 19861, 60961,
    338, 1130, 444, 753, 5988, 79025, 5958, 1176, 1175, 588, 1046,
    2256, 3496, 8617, 4004, 2730, 3072, 91737, 15541, 31272,
    5144, 5957, 702, 963, 176, 196, 239, 7539, 1146, 750,
    5793, 8977, 928, 14985, 6106, 936, 11349, 1204, 944,
    241, 7962, 8025, 1140, 1148, 31252, 3314, 1060, 223,
    962, 784, 1606, 2453, 2474, 311, 3115, 335, 875,
    5951, 938, 6137, 6287, 5950, 7405, 5962, 6274, 6306
];
const CACHE_KEY = "hplc-pubchem-curated-catalog-v5";
const SEARCH_CACHE_KEY = "hplc-pubchem-search-cache-v1";
const SEARCH_CACHE_LIMIT = 50;
export const SEARCH_CATEGORY = "PubChem Search Results";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CATALOG_CIDS = CURATED_CATEGORY_CIDS.length;

/**
 * Use this function to load a finite optional PubChem catalog, or local defaults when remote data is unavailable.
 * Inputs: `options` — optional batching, fetch, storage, timeout, abort, and progress dependencies.
 * Dependencies: `DEFAULT_COMPOUNDS`, `fetchJson`, `readCatalogCache`, `writeCatalogCache`, `compoundFromProperty`.
 */
export async function loadPreloadedCompounds(options = {}) {
    const {
        batchSize = 50,
        onProgress = () => {},
        fetchImplementation,
        storage,
        storageImplementation,
        signal,
        timeoutMs = REQUEST_TIMEOUT_MS,
        includeRemote = false
    } = options ?? {};
    const fallback = [...DEFAULT_COMPOUNDS];
    const remoteRequested = includeRemote || typeof fetchImplementation === "function";
    if (!remoteRequested) {
        reportProgress(onProgress, fallback.length, fallback.length);
        return fallback;
    }

    const cacheStorage = storage ?? storageImplementation;
    const cached = readCatalogCache(cacheStorage);
    if (cached) {
        reportProgress(onProgress, cached.length, CURATED_CATEGORY_CIDS.length);
        return cached;
    }

    const fetcher = resolveFetch(fetchImplementation);
    if (!fetcher || signal?.aborted) return fallback;

    const size = normalizeBatchSize(batchSize);
    const compounds = [];
    for (let start = 0; start < MAX_CATALOG_CIDS; start += size) {
        const cids = CURATED_CATEGORY_CIDS.slice(start, start + size);
        const data = await fetchJson(
            `${PUBCHEM_API}/compound/cid/${cids.join(",")}/property/Title,XLogP,MolecularWeight,Volume3D/JSON`,
            fetcher,
            { signal, timeoutMs }
        );
        if (!data) return fallback;

        const properties = Array.isArray(data.PropertyTable?.Properties)
            ? data.PropertyTable.Properties
            : null;
        if (!properties) return fallback;
        for (const property of properties) {
            const compound = compoundFromProperty(property);
            if (compound) compounds.push(compound);
        }
        reportProgress(onProgress, compounds.length, MAX_CATALOG_CIDS);
    }

    const result = compounds.length ? sortCompounds(compounds) : fallback;
    writeCatalogCache(cacheStorage, result);
    return result;
}

/**
 * Use this function to look up one named compound when the optional network lookup is appropriate.
 * Inputs: `name` — the PubChem compound name; `fetchImplementation` — optional fetch-compatible function.
 * Dependencies: `fetchJson`, `resolveFetch`, `compoundFromProperty`.
 */
export async function lookupCompound(name, fetchImplementation) {
    if (typeof name !== "string" || !name.trim()) return null;
    const fetcher = resolveFetch(fetchImplementation);
    if (!fetcher) return null;

    const data = await fetchJson(
        `${PUBCHEM_API}/compound/name/${encodeURIComponent(name.trim())}/property/Title,XLogP,MolecularWeight,Volume3D/JSON`,
        fetcher,
        {}
    );
    const property = data?.PropertyTable?.Properties?.[0];
    return compoundFromProperty(property);
}

/**
 * Use this function to read compounds found by earlier PubChem name searches.
 * Inputs: `storage` — optional storage object. Dependencies: `resolveStorage`, `compoundFromCache`.
 */
export function readSearchedCompounds(storage) {
    const store = resolveStorage(storage);
    if (!store) return [];
    try {
        const cached = JSON.parse(store.getItem(SEARCH_CACHE_KEY));
        return Array.isArray(cached) ? cached.map(compoundFromCache).filter(Boolean)
            .map(compound => ({ ...compound, category: SEARCH_CATEGORY })) : [];
    } catch {
        return [];
    }
}

/**
 * Use this function to remember one searched compound, newest first, bounded and deduplicated by name.
 * Inputs: `compound` — a parsed compound; `storage` — optional storage object.
 * Returns the remembered compound record. Dependencies: `readSearchedCompounds`, `compoundFromCache`.
 */
export function rememberSearchedCompound(compound, storage) {
    const record = compoundFromCache(compound);
    if (!record) return null;
    record.category = SEARCH_CATEGORY;
    const key = record.name.toLowerCase();
    const list = [record, ...readSearchedCompounds(storage)
        .filter(item => item.name.toLowerCase() !== key)].slice(0, SEARCH_CACHE_LIMIT);
    const store = resolveStorage(storage);
    try {
        store?.setItem(SEARCH_CACHE_KEY, JSON.stringify(list));
    } catch {
        // Storage can be full or denied; the in-memory catalog still holds the result.
    }
    return record;
}

/** Use this function to merge compound lists, keeping the first record for each case-insensitive name. */
export function mergeCompounds(...lists) {
    const merged = new Map();
    for (const compound of lists.flat()) {
        const key = compound?.name?.toLowerCase();
        if (key && !merged.has(key)) merged.set(key, compound);
    }
    return [...merged.values()];
}

/**
 * Use this function to convert a PubChem Volume3D value from Å³ per molecule to cm³/mol.
 * Inputs: `volume3DAngstrom3` — a positive numeric PubChem volume.
 * Dependencies: None.
 */
export function molarVolumeFromPubChem(volume3DAngstrom3) {
    const volume = finiteNumber(volume3DAngstrom3);
    return volume > 0 ? volume * 0.602214076 : null;
}

/** Use this function to obtain a usable fetch function without requiring browser globals during module import. */
function resolveFetch(fetchImplementation) {
    if (typeof fetchImplementation === "function") return fetchImplementation;
    return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
}

/**
 * Use this function to make one bounded JSON request and turn transport or schema failures into a null result.
 * Inputs: `url` — PubChem endpoint; `fetcher` — fetch-compatible function; `options` — timeout and abort settings.
 * Dependencies: `AbortController`, `setTimeout`, `clearTimeout`.
 */
async function fetchJson(url, fetcher, { signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    if (typeof fetcher !== "function" || signal?.aborted) return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const requestSignal = controller?.signal;
    let timer;
    let removeAbortListener = () => {};
    try {
        if (controller && signal) {
            const abort = () => controller.abort(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
            removeAbortListener = () => signal.removeEventListener("abort", abort);
        }
        if (controller) {
            const requestedTimeout = Number(timeoutMs);
            const timeout = Number.isFinite(requestedTimeout) && requestedTimeout > 0
                ? Math.min(requestedTimeout, REQUEST_TIMEOUT_MS)
                : REQUEST_TIMEOUT_MS;
            timer = setTimeout(() => controller.abort(), timeout);
        }
        const response = await fetcher(url, requestSignal ? { signal: requestSignal } : {});
        if (!response || response.ok !== true || typeof response.json !== "function") return null;
        const data = await response.json();
        return data && typeof data === "object" && !Array.isArray(data) ? data : null;
    } catch {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
        removeAbortListener();
    }
}

/** Use this function to parse a PubChem property into the finite compound schema used by the simulator. */
function compoundFromProperty(property) {
    if (!property || typeof property !== "object") return null;
    const name = typeof property.Title === "string" ? property.Title.trim() : "";
    const logP = finiteNumber(property.XLogP);
    if (!name || logP === null) return null;

    const cid = positiveInteger(property.CID);
    const molecularWeight = positiveNumber(property.MolecularWeight);
    if (property.MolecularWeight !== undefined && property.MolecularWeight !== null && molecularWeight === null) {
        return null;
    }
    return {
        cid,
        name,
        logP,
        molecularWeight,
        molarVolume: molarVolumeFromPubChem(property.Volume3D),
        curated: cid !== null && CURATED_CATEGORY_CIDS.includes(cid),
        category: categoryForCid(cid)
    };
}

/** Use this function to read a valid, fresh catalog from an injected browser storage object. */
function readCatalogCache(storage) {
    const store = resolveStorage(storage);
    if (!store) return null;
    try {
        const cached = JSON.parse(store.getItem(CACHE_KEY));
        if (!cached || !Number.isFinite(cached.updatedAt) || Date.now() - cached.updatedAt > CACHE_MAX_AGE_MS) {
            return null;
        }
        if (!Array.isArray(cached.compounds) || cached.compounds.length === 0) return null;
        const compounds = cached.compounds.map(compoundFromCache).filter(Boolean);
        return compounds.length === cached.compounds.length ? compounds : null;
    } catch {
        return null;
    }
}

/** Use this function to persist a validated catalog when browser storage is available. */
function writeCatalogCache(storage, compounds) {
    const store = resolveStorage(storage);
    if (!store) return;
    try {
        store.setItem(CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), compounds }));
    } catch {
        // Private browsing and restricted frames can reject storage writes.
    }
}

/** Use this function to accept only the finite catalog schema that can safely be used by the UI. */
function compoundFromCache(compound) {
    if (!compound || typeof compound !== "object" || typeof compound.name !== "string" || !compound.name.trim()) {
        return null;
    }
    const logP = finiteNumber(compound.logP);
    if (logP === null || (compound.molarVolume !== null && positiveNumber(compound.molarVolume) === null)) return null;
    return {
        cid: positiveInteger(compound.cid),
        name: compound.name.trim(),
        logP,
        molecularWeight: positiveNumber(compound.molecularWeight),
        molarVolume: compound.molarVolume === null ? null : positiveNumber(compound.molarVolume),
        curated: compound.curated === true,
        category: typeof compound.category === "string" && compound.category ? compound.category : "General Compounds"
    };
}

/** Use this function to avoid unbounded batch loops when a caller supplies an invalid batch size. */
function normalizeBatchSize(batchSize) {
    const size = Number(batchSize);
    return Number.isFinite(size) && size > 0 ? Math.max(1, Math.min(100, Math.floor(size))) : 50;
}

/** Use this function to keep progress callbacks from breaking a catalog fallback. */
function reportProgress(onProgress, loaded, total) {
    if (typeof onProgress !== "function") return;
    try {
        onProgress(loaded, total);
    } catch {
        // Progress is optional presentation state, not catalog correctness.
    }
}

/** Use this function to read storage safely when the browser denies access to localStorage. */
function resolveStorage(storage) {
    if (storage !== undefined) return storage && typeof storage.getItem === "function" ? storage : null;
    try {
        return globalThis.localStorage && typeof globalThis.localStorage.getItem === "function"
            ? globalThis.localStorage
            : null;
    } catch {
        return null;
    }
}

/** Use this function to parse numeric API values while rejecting empty, non-finite, and boolean values. */
function finiteNumber(value) {
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/** Use this function to parse optional positive API numbers such as molecular weight. */
function positiveNumber(value) {
    const number = finiteNumber(value);
    return number !== null && number > 0 ? number : null;
}

/** Use this function to parse positive integer PubChem identifiers. */
function positiveInteger(value) {
    const number = finiteNumber(value);
    return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

/** Use this function to assign the existing UI categories to curated PubChem identifiers. */
function categoryForCid(cid) {
    const index = CURATED_CATEGORY_CIDS.indexOf(cid);
    if (index >= 0 && index < 30) return "Pharmaceutical Compounds";
    if (index >= 30 && index < 55) return "Food Additives";
    if (index >= 55) return "Other Chemical Substances";
    return "General Compounds";
}

/** Use this function to provide stable category/name ordering for the optional remote catalog. */
function sortCompounds(compounds) {
    const categoryOrder = [
        "Pharmaceutical Compounds",
        "Food Additives",
        "Other Chemical Substances",
        "General Compounds"
    ];
    return compounds.sort((left, right) =>
        categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) ||
        left.name.localeCompare(right.name)
    );
}
