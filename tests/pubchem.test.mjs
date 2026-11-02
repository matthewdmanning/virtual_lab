import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPOUNDS } from "../apps/hplc-simulator/compounds.js";
import {
  loadPreloadedCompounds,
  lookupCompound,
  molarVolumeFromPubChem,
} from "../apps/hplc-simulator/pubchem.js";

test("local defaults preserve the existing names and do not invent volumes", () => {
  assert.deepEqual(
    DEFAULT_COMPOUNDS.map((compound) => compound.name),
    [
      "Caffeine",
      "Aspirin",
      "Ibuprofen",
      "Acetaminophen",
      "Naproxen",
      "Theophylline",
      "Warfarin",
    ],
  );
  assert.ok(
    DEFAULT_COMPOUNDS.every((compound) => compound.molarVolume === null),
  );
});

test("molar volume conversion rejects invalid values", () => {
  assert.equal(molarVolumeFromPubChem(0), null);
  assert.equal(molarVolumeFromPubChem("not-a-volume"), null);
  assert.equal(molarVolumeFromPubChem(true), null);
  assert.equal(molarVolumeFromPubChem([]), null);
  assert.equal(molarVolumeFromPubChem([100]), null);
  assert.equal(molarVolumeFromPubChem("100"), 60.2214076);
});

test("lookup parses numeric PubChem properties and rejects invalid input", async () => {
  let calls = 0;
  const fetchImplementation = async (url, options) => {
    calls += 1;
    assert.match(url, /compound\/name\/caffeine/);
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: true,
      async json() {
        return {
          PropertyTable: {
            Properties: [
              {
                CID: "2519",
                Title: "Caffeine",
                XLogP: "-0.07",
                MolecularWeight: "194.19",
                Volume3D: "280.1",
              },
            ],
          },
        };
      },
    };
  };

  assert.equal(await lookupCompound("", fetchImplementation), null);
  assert.equal(calls, 0);
  const compound = await lookupCompound("caffeine", fetchImplementation);
  assert.deepEqual(compound, {
    cid: 2519,
    name: "Caffeine",
    logP: -0.07,
    molecularWeight: 194.19,
    molarVolume: 280.1 * 0.602214076,
    curated: true,
    category: "Pharmaceutical Compounds",
  });
});

test("HTTP, malformed JSON, and abort failures fall back without throwing", async () => {
  const failingFetch = async () => ({
    ok: false,
    status: 503,
    async json() {
      return {};
    },
  });
  assert.equal(await lookupCompound("caffeine", failingFetch), null);

  const malformedFetch = async () => ({
    ok: true,
    async json() {
      return [];
    },
  });
  assert.equal(await lookupCompound("caffeine", malformedFetch), null);

  const controller = new AbortController();
  controller.abort();
  let called = false;
  const abortedFetch = async () => {
    called = true;
    throw new Error("should not be called");
  };
  const compounds = await loadPreloadedCompounds({
    includeRemote: true,
    fetchImplementation: abortedFetch,
    signal: controller.signal,
  });
  assert.equal(called, false);
  assert.deepEqual(compounds, [...DEFAULT_COMPOUNDS]);
});

test("corrupt storage is ignored and a finite remote catalog can be cached", async () => {
  const values = new Map([["hplc-pubchem-curated-catalog-v5", "{broken"]]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  let calls = 0;
  const fetchImplementation = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return {
          PropertyTable: {
            Properties: [{ CID: 2244, Title: "Remote compound", XLogP: "1.5" }],
          },
        };
      },
    };
  };
  const compounds = await loadPreloadedCompounds({
    fetchImplementation,
    storage,
    batchSize: 1000,
  });
  assert.equal(calls, 1);
  assert.equal(compounds[0].name, "Remote compound");
  assert.equal(compounds[0].molecularWeight, null);
  assert.equal(compounds[0].molarVolume, null);
  assert.ok(values.get("hplc-pubchem-curated-catalog-v5"));
});

test("fractional and invalid batch sizes always make finite progress", async () => {
  let calls = 0;
  const fetchImplementation = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return { PropertyTable: { Properties: [] } };
      },
    };
  };
  await loadPreloadedCompounds({
    includeRemote: true,
    fetchImplementation,
    batchSize: 0.5,
  });
  assert.ok(calls > 0 && calls < 100);

  calls = 0;
  for (const batchSize of [0, -1, Number.NaN, "invalid"]) {
    await loadPreloadedCompounds({
      includeRemote: true,
      fetchImplementation,
      batchSize,
    });
  }
  assert.ok(calls > 0 && calls < 20);
});

test("catalog timeout aborts a stalled request and returns local defaults", async () => {
  let aborted = false;
  const fetchImplementation = async (_url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(new Error("aborted"));
        },
        { once: true },
      );
    });
  const compounds = await loadPreloadedCompounds({
    includeRemote: true,
    fetchImplementation,
    timeoutMs: 1,
    batchSize: 1,
  });
  assert.equal(aborted, true);
  assert.deepEqual(compounds, [...DEFAULT_COMPOUNDS]);
});

test("searched compounds are remembered newest first and merged by name", async () => {
  const {
    mergeCompounds,
    readSearchedCompounds,
    rememberSearchedCompound,
    SEARCH_CATEGORY,
  } = await import("../apps/hplc-simulator/pubchem.js");
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  assert.deepEqual(readSearchedCompounds(storage), []);
  const record = {
    cid: 3672,
    name: "Ibuprofen",
    logP: 3.5,
    molecularWeight: 206.3,
    molarVolume: 120,
  };
  assert.equal(
    rememberSearchedCompound(record, storage).category,
    SEARCH_CATEGORY,
  );
  rememberSearchedCompound({ ...record, cid: 1, name: "Other" }, storage);
  rememberSearchedCompound(
    { ...record, name: "ibuprofen", logP: 3.9 },
    storage,
  );
  const remembered = readSearchedCompounds(storage);
  assert.deepEqual(
    remembered.map((compound) => compound.name),
    ["ibuprofen", "Other"],
  );
  assert.equal(rememberSearchedCompound({ name: "", logP: 1 }, storage), null);
  values.set("hplc-pubchem-search-cache-v1", "{broken");
  assert.deepEqual(readSearchedCompounds(storage), []);
  const merged = mergeCompounds(remembered, DEFAULT_COMPOUNDS);
  assert.equal(
    merged.filter((compound) => compound.name.toLowerCase() === "ibuprofen")
      .length,
    1,
  );
  assert.equal(
    merged.find((compound) => compound.name.toLowerCase() === "ibuprofen").logP,
    3.9,
  );
});
