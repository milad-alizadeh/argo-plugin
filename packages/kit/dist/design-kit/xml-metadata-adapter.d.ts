/**
 * C1 gap fix (build-design-workflow.md): the Figma MCP `get_metadata` tool
 * returns a wireframe frame as XML, but `flattenToRegions`/`buildRegionContract`
 * (region-contract.js) consume the normalized JSON tree shape documented by
 * `test/fixtures/flatten-metadata-tree.json` (`{id, name, type, layoutMode?,
 * componentName?, children}`). This adapter is the missing ingest step between
 * the two — pure, no fs/network calls, so it is unit-testable off-Figma like
 * the rest of this package.
 */
type MetaNode = Record<string, any>;
/**
 * Stack-based build: an `open` token pushes a new (incomplete) node frame, a
 * `self` token is a completed leaf attached to the current top-of-stack, and
 * a `close` token pops the completed node and attaches it to its parent (or
 * returns it, at the root).
 */
export declare function parseMetadataXml(xml: string): MetaNode;
export {};
//# sourceMappingURL=xml-metadata-adapter.d.ts.map